#!/usr/bin/env node

import 'dotenv/config';

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as minimist from 'minimist';
import { staticPages, Route } from '@static-pages/core';

import { flattenObject } from './flatten-object.js';
import { importModule } from './import-module.js';
import { parseArgs } from './parse-args';
import {
	assertObject,
	assertImport,
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
const unknownParams = Object.keys(flattenObject(argv)).filter(arg => [
	/^_\.?/, // argv always includes an array as '_'
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
	console.log(fs.readFileSync(__dirname + '/../HELP.txt', 'utf-8'));
}

/**
 * Resolves string properties of a 'cli' route into real objects used by 'core' route definitions.
 *
 * @param route CLI route definition where properties are strings and needs to be resolved to its corresponding types.
 * @returns Proper route definition accepted by static-pages/core.
 */
async function prepareRoute(route: unknown): Promise<Route> {
	assertObject('route', route);
	const { from, to, controller, variables } = route;

	assertImport('from', from);
	const fromModuleName = typeof from === 'string' ? from : from.module;

	const fromFactory = await importModule(from);
	if (typeof fromFactory !== 'function')
		throw new Error(`'from.module' error: '${fromModuleName}' does not exports a function.`);

	const fromArgs = typeof from === 'object' ? await parseArgs(from.args) : [];

	const fromIterable = await fromFactory(...fromArgs);
	if (!(Symbol.iterator in fromIterable || Symbol.asyncIterator in fromIterable))
		throw new Error(`'from.module' error: '${fromModuleName}' does not provide an iterable or async iterable.`);

	assertImport('to', to);
	const toModuleName = typeof to === 'string' ? to : to.module;

	const toFactory = await importModule(to);
	if (typeof toFactory !== 'function')
		throw new Error(`'to.module' error: '${toModuleName}' does not exports a function.`);

	const toArgs = typeof to === 'object' ? await parseArgs(to.args) : [];

	const toWriter = await toFactory(...await toArgs);
	if (typeof toWriter !== 'function')
		throw new Error(`'to.module' error: '${toModuleName}' does not provide a function after initialization.`);

	let controllerFn;
	if (typeof controller !== 'undefined') {
		assertController(controller);
		const controllerModuleName = typeof controller === 'string' ? controller : controller.module;

		controllerFn = await importModule(controller);
		if (typeof controllerFn !== 'function')
			throw new Error(`'controller' error: '${controllerModuleName}' does not provide a function.`);
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
		return Promise.all(
			(Array.isArray(config) ? config : [config])
				.map(x => prepareRoute(x))
		);
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
