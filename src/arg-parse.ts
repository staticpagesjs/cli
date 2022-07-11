/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */

import * as path from 'path';
import { Script } from 'vm';
import { ensureArray } from './ensure-array';

const isFunctionLike = /^\s*(?:async)?\s*(?:\([a-zA-Z0-9_, ]*\)\s*=>|[a-zA-Z0-9_,]+\s*=>|function\s*\*?\s*[a-zA-Z0-9_,]*\s*\([a-zA-Z0-9_,]*\)\s*{)/;
const tryParseFunction = (value: string): string | { (data: Record<string, unknown>): string } => {
	if (isFunctionLike.test(value)) {
		return new Script(value).runInNewContext();
	}
	return value;
};

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && !!x;
const isUnknownFunction = (x: unknown): x is { (...args: unknown[]): unknown } => typeof x === 'function';
const isTwigFiltersObject = (x: unknown): x is Record<string, Function | [Function, Array<unknown>]> => (
	typeof x === 'object' && !!x && Object.values(x).every(v => (
		(Array.isArray(v) && typeof v[0] === 'function' && typeof v[1] === 'object')
		|| typeof v === 'function'
	))
);
const isTwigFunctionsObject = (x: unknown): x is Record<string, Function | [Function, Array<unknown>]> => (
	typeof x === 'object' && !!x && Object.values(x).every(v => (
		(Array.isArray(v) && typeof v[0] === 'function' && typeof v[1] === 'object')
		|| typeof v === 'function'
	))
);

/**
 * Imports an ES or CJS module, relative from the process.cwd().
 *
 * @param moduleName Module path.
 * @param exportName Preferred export, if not exists fallbacks to default, then a cjs function export.
 * @returns Module exports.
 */
const importModule = async (moduleName: string, exportName: string): Promise<unknown> => {
	try {
		const module = await import(moduleName.startsWith('.') ? path.resolve(process.cwd(), moduleName) : moduleName);
		return module[exportName] ?? module.default ?? module;
	} catch (error: unknown) {
		throw new Error(`Error: failed to load module '${moduleName}': ${error instanceof Error ? error.message : error}\n${error instanceof Error ? 'Trace: ' + error.stack : 'No stack trace available.'}`);
	}
};

/**
 * Imports a CJS or ESM module based on the cli arguments passed.
 */
const tryImportModuleCli = async (optionName: string, optionValue: unknown): Promise<unknown> => {
	if (typeof optionValue === 'string') {
		const module = await importModule(optionValue, optionName);
		if (typeof module === 'undefined')
			throw new Error(`Error: failed to load module specified in '${optionName}' option: imported value is 'undefined'.`);

		return module;
	} else if (isObject(optionValue)) {
		if (typeof optionValue.module !== 'string')
			throw new Error(`Error: '${optionName}.module' option is invalid type, expected string.`);
		if (typeof optionValue.export !== 'undefined' && typeof optionValue.export !== 'string')
			throw new Error(`Error: '${optionName}.export' option is invalid type, expected string.`);

		const module = await importModule(optionValue.module, optionValue.export ?? optionName);
		if (typeof module === 'undefined')
			throw new Error(`Error: failed to load module specified in '${optionName}' option: imported value is 'undefined'.`);

		return module;
	} else if (typeof optionValue !== 'undefined') {
		throw new Error(`Error: '${optionName}' option is invalid type, expected object or string.`);
	}
};

const fileWriterOptionsFromCliParameters = (options: Record<string, unknown>) => {
	if (typeof options.outFile === 'string') {
		if (!isFunctionLike.test(options.outFile)) {
			throw new Error('Error: \'outFile\' parameter error: provided string does not look like a function.');
		}
		options.outFile = new Script(options.outFile).runInNewContext();
	}

	if (typeof options.renderer === 'string') {
		if (!isFunctionLike.test(options.renderer)) {
			throw new Error('Error: \'renderer\' parameter error: provided string does not look like a function.');
		}
		options.renderer = new Script(options.renderer).runInNewContext();
	}

	return options;
};

const twigWriterOptionsFromCliParameters = async (options: Record<string, unknown>) => {
	// VIEW
	if (typeof options.view === 'string') {
		options.view = tryParseFunction(options.view);
	}

	// GLOBALS
	const importedGlobals = await tryImportModuleCli('globals', options.globals);
	if (typeof importedGlobals !== 'undefined') {
		if (!isObject(importedGlobals)) {
			throw new Error('Error: failed to load module specified in \'globals\' option: imported value is not an object.');
		}
		options.globals = importedGlobals;
	}

	// FUNCTIONS
	const importedFunctions = await tryImportModuleCli('functions', options.functions);
	if (typeof importedFunctions !== 'undefined') {
		if (!isTwigFunctionsObject(importedFunctions)) {
			throw new Error('Error: failed to load module specified in \'functions\' option: imported value is not a function map.');
		}
		options.functions = importedFunctions;
	}

	// FILTERS
	const importedFilters = await tryImportModuleCli('filters', options.filters);
	if (typeof importedFilters !== 'undefined') {
		if (!isTwigFiltersObject(importedFilters)) {
			throw new Error('Error: failed to load module specified in \'filters\' option: imported value is not a function map.');
		}
		options.filters = importedFilters;
	}

	// ADVANCED
	const importedAdvanced = await tryImportModuleCli('advanced', options.advanced);
	if (typeof importedAdvanced !== 'undefined') {
		if (!isUnknownFunction(importedAdvanced)) {
			throw new Error('Error: failed to load module specified in \'advanced\' option: imported value is not a function.');
		}
		options.advanced = importedAdvanced;
	}

	fileWriterOptionsFromCliParameters(options);
};

export const ejsWriterOptionsFromCliParameters = (options: Record<string, unknown>) => {
	// VIEW
	if (typeof options.view === 'string') {
		options.view = tryParseFunction(options.view);
	}

	return fileWriterOptionsFromCliParameters(options);
};

export const parseArgs = (module: string, args: any): Record<string, unknown>[] => {
	const argArr = ensureArray(args);

	for (const arg of argArr) {
		switch (module) {
		case '@static-pages/file-writer':
			fileWriterOptionsFromCliParameters(arg);
			break;
		case '@static-pages/twig-writer':
		case '@static-pages/nunjucks-writer':
			twigWriterOptionsFromCliParameters(arg);
			break;
		case '@static-pages/ejs-writer':
		case '@static-pages/mustache-writer':
			ejsWriterOptionsFromCliParameters(arg);
			break;
		}
	}

	return argArr;
};
