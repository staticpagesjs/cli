#!/usr/bin/env node

import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as minimist from 'minimist';
import { staticPages, Route, Controller } from '@static-pages/core';

import { parseArgs } from './arg-parse';
import { ensureArray } from './ensure-array';
import { flattenObject } from './flatten-object.js';
import {
	assertObject,
	assertFromTo,
	assertController
} from './assert.js';

const argv = minimist(process.argv.slice(2), {
	alias: {
		c: 'config',
		h: 'help',
		v: 'version',
	},
	boolean: [
		'help',
		'version',
	],
});

// Check for incorrect arguments
const argKeys = Object.keys(flattenObject(argv));
const unknownParams = argKeys.filter(arg => [
	/^_$/, // argv always includes an array as '_'
	/^c$/, /^config$/,
	/^h$/, /^help$/,
	/^v$/, /^version$/,
	/^(:?from|to)(?:\.module|\.export|\.args\.(?:[a-zA-Z0-9_-]+\.?)*[a-zA-Z0-9_-]+)?$/,
	/^controller(?:\.module|\.export)?$/,
	/^variables\.(?:[a-zA-Z0-9_-]+\.?)*[a-zA-Z0-9_-]+$/,
].every(pattern => !pattern.test(arg)));

if (unknownParams.length > 0 || argv._.length > 0) {
	for (const arg of unknownParams) {
		console.error(`Unknown argument: ${arg.length > 1 ? '--' : '-'}${arg}`);
	}
	for (const arg of argv._) {
		console.error(`Unknown argument: ${arg}`);
	}
	console.error('\nSee --help for usage.');
	process.exit(1);
}

// Version page
function showVersion() {
	const pkg = JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf-8'));
	console.log(pkg.version);
}

// Help page
function showHelp() {
	const pkg = JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf-8'));
	console.log(`Usage: ${Object.keys(pkg.bin)[0]} [options]

Options:
  -h, --help               Display help.
  -v, --version            Output the current cli version.
  -c, --config <file>      Load configuration from YAML or JSON file.
  --from <package>         Shorthand for --form.module; disables other --from.*
                           arguments. Usage is not recommended in production.
  --from.module <package>  The module to import from using node require().
  --from.export <name>     Name of the exports to be imported. Default: 'default'.
                           If not found, falls back to the default export.
  --from.args.* <value>    Arguments passed to the reader factory method.
  --to <package>           Shorthand for --to.module; disables other --to.*
                           arguments. Usage is not recommended in production.
  --to.module <package>    The module to import from using node require().
  --to.export <name>       Name of the exports to be imported. Default: 'default'.
                           If not found, falls back to the default export.
  --to.args.* <value>      Arguments passed to the writer factory method.
  --controller <package>   Shorthand for --controller.module; disables other
                           --controller.* arguments.
  --controller.module      Your custom controller that works on the page data.
  --controller.export      Name of the exports to be imported. Default: 'default'.
  --variables.* <value>    Additional variables that will be accessible in the
                           controller's context (this.<variable>).`);
}

/**
 * Optimistic implementation for a type guard to test for `Controller` types.
 *
 * @param fn: Subject to test
 */
const isController = (fn: unknown): fn is Controller => typeof fn === 'function';

/**
 * Imports an ES or CJS module, relative from the process.cwd().
 *
 * @param moduleName Module path.
 * @param exportName Preferred export, if not exists fallbacks to default, then a cjs function export.
 * @returns Module exports.
 */
const importModule = async (moduleName: string, exportName = 'default'): Promise<unknown> => {
	try {
		const module = await import(moduleName.startsWith('.') ? path.resolve(process.cwd(), moduleName) : moduleName);
		return module[exportName] ?? module.default?.[exportName] ?? module.default ?? module;
	} catch (error: unknown) {
		throw new Error(`Failed to load module '${moduleName}': ${error instanceof Error ? error.message : error}\n${error instanceof Error ? 'Trace: ' + error.stack : 'No stack trace available.'}`);
	}
};

/**
 * Resolves string properties of a 'cli' route into real objects used by 'core' route definitions.
 *
 * @param route CLI route definition where properties are strings and needs to be resolved to its corresponding types.
 * @returns Proper route definition accepted by static-pages/core.
 */
async function prepareRoute(route: unknown): Promise<Route> {
	assertObject('route', route);

	const { from, to, controller, variables } = route;

	assertFromTo('from', from);
	const fromObj = typeof from === 'object' ? from : { module: from };
	const fromFactory = await importModule(fromObj.module, fromObj.export);
	if (typeof fromFactory !== 'function')
		throw new Error(`'from.module' error: '${fromObj.module}' does not exports a function.`);
	const fromIterable = await fromFactory(...parseArgs(fromObj.module, fromObj.args));
	if (!(Symbol.iterator in fromIterable || Symbol.asyncIterator in fromIterable))
		throw new Error(`'from.module' error: '${fromObj.module}' does not provide an iterable or async iterable.`);

	assertFromTo('to', to);
	const toObj = typeof to === 'object' ? to : { module: to };
	const toFactory = await importModule(toObj.module, toObj.export);
	if (typeof toFactory !== 'function')
		throw new Error(`'to.module' error: '${toObj.module}' does not exports a function.`);
	const toWriter = await toFactory(...parseArgs(toObj.module, toObj.args));
	if (typeof toWriter !== 'function')
		throw new Error(`'to.module' error: '${toObj.module}' does not provide a function after initialization.`);

	let controllerFn;
	if (typeof controller !== 'undefined') {
		assertController(controller);
		const controllerObj = typeof controller === 'object' ? controller : { module: controller };
		controllerFn = await importModule(controllerObj.module, controllerObj.export);

		if (!isController(controllerFn))
			throw new Error(`'controller' error: '${controllerObj.module}' does not provide a function.`);
	}

	if (typeof variables !== 'undefined')
		assertObject('variables', variables);

	// Construct the route object accepted by @static-pages/core
	return {
		from: fromIterable,
		to: toWriter,
		controller: controllerFn?.bind?.(variables),
	};
}

/**
 * Reads configuration from yaml file.
 *
 * @param file Path to the configuration file.
 * @returns Route definitions.
 */
function routesFromFile(file: string): Promise<Route[]> {
	if (!fs.existsSync(file)) {
		throw new Error(`Configuration file does not exists: ${file}`);
	}
	try {
		const config = yaml.load(fs.readFileSync(file, 'utf-8'));
		return Promise.all(ensureArray(config).map(x => prepareRoute(x)));
	} catch (error: unknown) {
		throw new Error(`Could not prepare configuration: ${error instanceof Error ? error.message : error}`);
	}
}

(async () => {
	let routes: Route | Route[];
	if (argv.version) {
		showVersion();
		process.exit(0);
	} else if (argv.config) {
		routes = await routesFromFile(argv.config);
	} else if (argv.from || argv.to || argv.controller || argv.variables) {
		routes = await prepareRoute(argv);
	} else { // when --help is supplied or when no args present
		showHelp();
		process.exit(0);
	}

	// The work.
	await staticPages(routes);

})()
	.catch(err => {
		console.error(err?.message ?? err);
		process.exit(1);
	});
