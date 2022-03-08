#!/usr/bin/env node

import 'dotenv/config';

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as importFrom from 'import-from';
import * as minimist from 'minimist';
import staticPages, { Route, Controller } from '@static-pages/core';

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
function flattenObjectKeys(obj: object): string[] {
	const keys: string[] = [];
	const walk = (obj: object, parent = ''): void => {
		for (const [key, value] of Object.entries(obj)) {
			if (typeof value === 'object' && value) {
				walk(value, `${parent}${key}.`);
			} else {
				keys.push(`${parent}${key}`);
			}
		}
	};
	walk(obj);
	return keys;
}

const unknownArgs = flattenObjectKeys(argv).filter(arg => [
	/^_$/,
	/^config$/, /^c$/,
	/^help$/, /^h$/,
	/^version$/, /^v$/,
	/^from(?:\.module|\.import|\.args\.(?:[a-zA-Z0-9_-]+\.?)*[a-zA-Z0-9_-]+)?$/,
	/^to(?:\.module|\.import|\.args\.(?:[a-zA-Z0-9_-]+\.?)*[a-zA-Z0-9_-]+)?$/,
	/^controller(?:\.module|\.import)?$/
].every(pattern => !pattern.test(arg)));

if (unknownArgs.length > 0) {
	for (const arg of unknownArgs) {
		console.error(`Unknown argument: ${arg.length > 1 ? '--' : '-'}${arg}`);
	}
	console.error('\nSee --help for usage.');
	process.exit(1);
}

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
const importModule = (file: string, preferredImport = 'cli'): unknown => {
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
	const { from, to, controller, variables } = route as any;

	// --from
	const fromIsObject = from && typeof from === 'object';
	const fromModuleKey = fromIsObject ? 'from.module' : 'from';
	const fromModuleName = fromIsObject ? from.module : from;
	const fromImportName = fromIsObject ? from.import : 'cli';
	const fromArgs = fromIsObject ? from.args : undefined;

	assertType('from', from, 'object', 'string');
	assertType(fromModuleKey, fromModuleName, 'string');

	const fromFactory = importModule(fromModuleName, fromImportName);
	if (typeof fromFactory !== 'function')
		throw new Error(`'${fromModuleKey}' error: '${fromModuleName}' does not exports a function.`);

	const fromIterable = await fromFactory(...ensureArray(fromArgs));
	if (!(Symbol.iterator in fromIterable || Symbol.asyncIterator in fromIterable))
		throw new Error(`'${fromModuleKey}' error: '${fromModuleName}' does not provide an iterable or async iterable.`);

	// --to
	const toIsObject = to && typeof to === 'object';
	const toModuleKey = toIsObject ? 'to.module' : 'to';
	const toModuleName = toIsObject ? to.module : to;
	const toImportName = toIsObject ? to.import : 'cli';
	const toArgs = toIsObject ? to.args : undefined;

	assertType('to', to, 'object', 'string');
	assertType(toModuleKey, toModuleName, 'string');

	const toFactory = importModule(toModuleName, toImportName);
	if (typeof toFactory !== 'function')
		throw new Error(`'${toModuleKey}' error: '${toModuleName}' does not exports a function.`);

	const toWriter = await toFactory(...ensureArray(toArgs));
	if (typeof toWriter !== 'function')
		throw new Error(`'${toModuleKey}' error: '${toModuleName}' does not provide a function after initialization.`);

	// --controller
	const controllerIsObject = controller && typeof controller === 'object';
	const controllerModuleKey = controllerIsObject ? 'controller.module' : 'controller';
	const controllerModuleName = controllerIsObject ? controller.module : controller;
	const controllerImportName = controllerIsObject ? controller.import : 'cli';

	if (controller) {
		assertType('controller', controller, 'object', 'string');
		assertType(controllerModuleKey, controllerModuleName, 'string');
	}
	const controllerFn = typeof controllerModuleName === 'string' ? importModule(controllerModuleName, controllerImportName) : undefined;
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
	if (argv.version) {
		showVersion();
		process.exit(0);
	} else if (argv.config) {
		routes = await routesFromFile(argv.config);
	} else if (argv.from || argv.to) {
		routes = await prepareRoute(argv);
	} else {
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


function showVersion() {
	const pkg = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf-8'));
	console.log(pkg.version);
}

function showHelp() {
	const pkg = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf-8'));
	console.log(`Usage: ${Object.keys(pkg.bin)[0]} [options]

Options:
  -h, --help               Display help.
  -v, --version            Output the current cli version.
  -c, --config <file>      Load configuration from YAML or JSON file.
  --from <package>         Shorthand for --form.module; disables other --from.*
                           arguments. Usage is not recommended in production.
  --from.module <package>  The module to import from using node require().
  --from.export <name>     Name of the exports to be imported. Default: 'cli'.
                           If not found, falls back to the default export.
  --from.args.* <value>    Arguments passed to the reader factory method.
  --to <package>           Shorthand for --to.module; disables other --to.*
                           arguments. Usage is not recommended in production.
  --to.module <package>    The module to import from using node require().
  --to.export <name>       Name of the exports to be imported. Default: 'cli'.
                           If not found, falls back to the default export.
  --to.args.* <value>      Arguments passed to the writer factory method.
  --controller <package>   Shorthand for --controller.module; disables other
                           --controller.* arguments.
  --controller.module      Your custom controller that works on the page data.
  --controller.export      Name of the exports to be imported. Default: 'cli'.
  --variables.* <value>    Additional variables that will be accessible in the
                           controller's context (this.<variable>).`);
}
