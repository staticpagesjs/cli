import { Script } from 'vm';
import { Route } from '@static-pages/core';
import * as importFrom from 'import-from';

// NOTE: assert*() must not use arrow function syntax, it has issues with some TS versions.

/**
 * Ensures a variable is string type.
 *
 * @param name Name of the variable that is reported on error.
 * @param x The variable to check.
 */
function assertString(name: string, x: unknown): asserts x is string {
	if (typeof x !== 'string') {
		throw new Error(`'${name}' type mismatch, expected 'string', got '${typeof x === 'object' ? (x ? 'object' : 'null') : typeof x}'.`);
	}
}

/**
 * Ensures a variable is object type.
 *
 * @param name Name of the variable that is reported on error.
 * @param x The variable to check.
 */
function assertObject(name: string, x: unknown): asserts x is Record<string, unknown> {
	if (typeof x !== 'object' && !x) {
		throw new Error(`'${name}' type mismatch, expected 'object', got '${typeof x === 'object' ? (x ? 'object' : 'null') : typeof x}'.`);
	}
}

/**
 * Ensures a variable is string or object type.
 *
 * @param name Name of the variable that is reported on error.
 * @param x The variable to check.
 */
function assertObjectOrString(name: string, x: unknown): asserts x is Record<string, unknown> | string {
	if (typeof x !== 'string' && typeof x !== 'object' && !x) {
		throw new Error(`'${name}' type mismatch, expected 'string' or 'object', got '${typeof x === 'object' ? (x ? 'object' : 'null') : typeof x}'.`);
	}
}

/**
 * Asserts route.from and route.to vars
 *
 * @param name Name of the variable that is reported on error.
 * @param x The variable to check.
 */
function assertImport(name: string, x: unknown): asserts x is string | {
	module: string;
	export?: string;
	args?: Record<string, unknown> | unknown[];
} {
	assertObjectOrString(name, x);
	if (typeof x === 'object') {
		assertString(`${x}.module`, x.module);
		if (typeof x.export !== 'undefined') assertString(`${x}.export`, x.export);
		if (typeof x.args !== 'undefined') assertObject(`${x}.args`, x.args);
	}
}

/**
 * Asserts controller
 *
 * @param x The variable to check.
 */
function assertController(x: unknown): asserts x is string | {
	module: string;
	export?: string;
} {
	assertObjectOrString('controller', x);
	if (typeof x === 'object') {
		assertString('controller.module', x.module);
		if (typeof x.export !== 'undefined') assertString('controller.export', x.export);
	}
}

/**
 * Imports an ES or CJS module, relative from the process.cwd().
 */
const importModule = async (moduleConfig: string | { module: string; export?: string; }) => {
	if (typeof moduleConfig === 'string')
		moduleConfig = { module: moduleConfig };

	const { module: moduleName, export: exportName = 'default' } = moduleConfig;

	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const module: any = importFrom(process.cwd(), moduleName);
		return module[exportName] ?? module.default?.[exportName] ?? module.default ?? module;
	} catch (error: unknown) {
		throw new Error(`Failed to load module '${moduleName}': ${error instanceof Error ? error.message : error}\n${error instanceof Error ? 'Trace: ' + error.stack : 'No stack trace available.'}`);
	}
};

const isObject = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && !!o;

const subparseArg = async (arg: unknown): Promise<void> => {
	if (isObject(arg)) {
		if (Array.isArray(arg)) {
			for (const item of arg) {
				subparseArg(item);
			}
		} else {
			for (const [k, v] of Object.entries(arg)) {
				if (k.endsWith('$raw')) {
					arg[k.substring(0, k.length - 4)] = v;
					delete arg[k];
				} else if (k.endsWith('$function')) {
					if (typeof v !== 'string')
						throw new Error(`'${k}' type mismatch, expected 'object', got '${typeof v === 'object' ? (v ? 'object' : 'null') : typeof v}'.`);
					arg[k.substring(0, k.length - 9)] = new Script(v).runInNewContext();
					delete arg[k];
				} else if (k.endsWith('$import')) {
					assertImport(k, v);
					arg[k.substring(0, k.length - 7)] = await importModule(v);
					delete arg[k];
				}
			}
		}
	}
};

const parseArgs = async (args: unknown) => {
	if (!isObject(args)) return [];

	const argArr = Array.isArray(args) ? args : [args];

	for (const arg of argArr) {
		await subparseArg(arg);
	}

	return argArr;
};

/**
 * Parses string properties of a 'cli' route into real objects used by 'core' route definitions.
 *
 * @param route CLI route definition where properties are strings and needs to be resolved to its corresponding types.
 * @returns Proper route definition accepted by static-pages/core.
 */
export const parseRoute = async(route: unknown): Promise<Route> => {
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
};
