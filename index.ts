#!/usr/bin/env node

import 'dotenv/config';

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as importFrom from 'import-from';
import * as minimist from 'minimist';
import staticPages, { Route, Controller } from '@static-pages/core';

const argv = minimist(process.argv.slice(2), {
	alias: {
		C: 'config',
		f: 'from.module',
		t: 'to.module',
		c: 'controller',
		h: 'help',
		v: 'version',
	},
	boolean: [
		'help',
		'version',
	],
});

/**
 * Ensures a variable has the desired type.
 *
 * @param name Name of the variable that is reported on error.
 * @param x The variable to check.
 * @param desiredType The desired type.
 */
const assertType = (name: string, x: unknown, ...desiredType: string[]): void => {
	const actualType = typeof x === 'object' ? (x ? 'object' : 'null') : typeof x;
	if (!desiredType.includes(actualType)) {
		const last = desiredType.pop();
		throw new Error(`'${name}' type mismatch, expected '${desiredType.join('\', \'')}${desiredType.length > 0 ? '\' or \'' : ''}${last}', got '${actualType}'.`);
	}
};

/**
 * Optimistic implementation for a type guard to test for `Controller` types.
 *
 * @param fn: Subject to test
 */
const isController = (fn: unknown): fn is Controller => typeof fn === 'function';

/**
 * Ensures that the given object is an array.
 * Wraps it in array if its not an array.
 *
 * @param x Any object.
 * @returns Array.
 */
const ensureArray = (x: unknown): unknown[] => Array.isArray(x) ? x : [x];

/**
 * Imports a CommonJS module, relative from the process.cwd().
 *
 * @param file Module path.
 * @param preferredImport Preferred import, if not exists fallbacks to default, then a cjs function export.
 * @returns Module exports.
 */
const importCliModule = (file: string, preferredImport = 'cli'): unknown => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mod: any = importFrom(process.cwd(), file);
		if (mod[preferredImport]) return mod[preferredImport];
		if (mod.default) return mod.default;
		return mod;
	} catch (error: unknown) {
		throw new Error(`Failed to load module '${file}': ${error instanceof Error ? error.message : error}\n${error instanceof Error ? 'Trace: ' + error.stack : 'No stack trace available.'}`);
	}
};

/**
 * Resolves string properties of a 'cli' route into real objects used by 'core' route definitions.
 *
 * @param route CLI route definition where properties are strings and needs to be resolved to its corresponding types.
 * @returns Proper route definition accepted by static-pages/core.
 */
async function prepareRoute(route: unknown): Promise<Route> {
	assertType('arguments', route, 'object');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const { from, to, controller, variables } = <any>route;

	// --from
	const fromModuleKey = from && typeof from === 'object' ? 'from.module' : 'from';
	const fromModuleName = from && typeof from === 'object' ? from.module : from;
	const fromImportName = from && typeof from === 'object' ? from.import : 'cli';
	const fromArgs = typeof from === 'object' ? from.args : undefined;

	assertType('from', from, 'object', 'string');
	assertType(fromModuleKey, fromModuleName, 'string');

	const fromFactory = importCliModule(fromModuleName, fromImportName);
	if (typeof fromFactory !== 'function')
		throw new Error(`'${fromModuleKey}' of '${fromModuleName}' does not exports a function.`);

	const fromIterable = await fromFactory(...ensureArray(fromArgs));
	if (!(Symbol.iterator in fromIterable || Symbol.asyncIterator in fromIterable))
		throw new Error(`'${fromModuleKey}' of '${fromModuleName}' does not provide an iterable or async iterable.`);

	// --to
	const toModuleKey = to && typeof to === 'object' ? 'to.module' : 'to';
	const toModuleName = to && typeof to === 'object' ? to.module : to;
	const toImportName = to && typeof to === 'object' ? to.import : 'cli';
	const toArgs = to && typeof to === 'object' ? to.args : undefined;

	assertType('to', to, 'object', 'string');
	assertType(toModuleKey, toModuleName, 'string');

	const toFactory = importCliModule(toModuleName, toImportName);
	if (typeof toFactory !== 'function')
		throw new Error(`'${toModuleKey}' error: '${toModuleName}' does not exports a function.`);

	const toWriter = await toFactory(...ensureArray(toArgs));
	if (typeof toWriter !== 'function')
		throw new Error(`'${toModuleKey}' error: '${toModuleName}' does not provide a function after initialization.`);

	// --controller
	const controllerModuleKey = controller && typeof controller === 'object' ? 'controller.module' : 'controller';
	const controllerModuleName = controller && typeof controller === 'object' ? controller.module : controller;
	const controllerImportName = controller && typeof controller === 'object' ? controller.import : 'cli';

	if (controller) {
		assertType('controller', controller, 'object', 'string');
		assertType(controllerModuleKey, controllerModuleName, 'string');
	}
	const controllerFn = typeof controllerModuleName === 'string' ? importCliModule(controllerModuleName, controllerImportName) : undefined;
	if (typeof controllerFn !== 'undefined' && !isController(controllerFn))
		throw new Error(`'controller' error: '${controller}' does not provide a function.`);

	// Construct the route object accepted by @static-pages/core
	return {
		from: fromIterable,
		to: toWriter,
		controller: controllerFn,
		variables: variables,
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
		return Promise.all(
			ensureArray(yaml.load(fs.readFileSync(file, 'utf-8')))
				.map(x => prepareRoute(x))
		);
	} catch (error: unknown) {
		throw new Error(`Could not prepare configuration: ${error instanceof Error ? error.message : error}`);
	}
}

(async () => {
	let routes: Route | Route[];
	if (argv.config || argv.c) {
		// from config file via --config
		routes = await routesFromFile(argv.config || argv.c);
	} else if (Object.keys(argv).length > 1) { // argv['_'] always exists!
		// from command line options
		routes = await prepareRoute(argv);
	} else {
		const pkg = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf-8'));
		console.log(pkg);

		// TODO: program.help();
		// program
		// 	.name(Object.keys(pkg.bin)[0])
		// 	.version(pkg.version, '--version', 'output the current cli version')
		// 	.option('-c, --config <path>', 'path to a build configuration file')
		// 	.option('-f, --from <package>', 'import \'cli\' or \'default\' from this package as the reader')
		// 	.option('-a, --from-args <JSON-string>', 'arguments passed to reader; provide in JSON format')
		// 	.option('-t, --to <package>', 'import \'cli\' or \'default\' from this package as the writer')
		// 	.option('-b, --to-args <JSON-string>', 'arguments passed to writer; provide in JSON format')
		// 	.option('-s, --controller <package>', 'controller that can process the input data before rendering')
		// 	.option('-v, --variables <JSON-string>', 'additional object that will be passed to the controller as \'this\'')
		// 	.parse();
		process.exit();

	}

	// The work.
	await staticPages(routes);

})()
	.catch(err => {
		console.error(err?.message ?? err);
		process.exit(1);
	});
