/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */

import { Script } from 'vm';
import { ensureArray } from './ensure-array.js';
import { importModule } from './import-module.js';

const isFunctionLike = /^\s*(?:async)?\s*(?:\([a-zA-Z0-9_, ]*\)\s*=>|[a-zA-Z0-9_,]+\s*=>|function\s*\*?\s*[a-zA-Z0-9_,]*\s*\([a-zA-Z0-9_,]*\)\s*{)/;
const tryParseFunction = (value: string): string | { (data: Record<string, unknown>): string } => {
	if (isFunctionLike.test(value)) {
		return new Script(value).runInNewContext();
	}
	return value;
};

/**
 * Imports a CJS or ESM module based on the cli arguments passed.
 */
const tryImportModuleCli = async (optionName: string, optionValue: any): Promise<unknown> => {
	if (typeof optionValue === 'string') {
		const module = await importModule(optionValue, optionName);
		if (typeof module === 'undefined')
			throw new Error(`Error: failed to load module specified in '${optionName}' option: imported value is 'undefined'.`);

		return module;
	} else if (typeof optionValue === 'object' && optionValue) {
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

const fileWriterOptionsFromCliParameters = async (options: Record<string, unknown>) => {
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
};

const twigWriterOptionsFromCliParameters = async (options: Record<string, unknown>) => {
	// VIEW
	if (typeof options.view === 'string') {
		options.view = tryParseFunction(options.view);
	}

	// GLOBALS
	const importedGlobals = await tryImportModuleCli('globals', options.globals);
	if (typeof importedGlobals !== 'undefined') {
		if (typeof importedGlobals !== 'object' || !importedGlobals) {
			throw new Error('Error: failed to load module specified in \'globals\' option: imported value is not an object.');
		}
		options.globals = importedGlobals;
	}

	// FUNCTIONS
	const importedFunctions = await tryImportModuleCli('functions', options.functions);
	if (typeof importedFunctions !== 'undefined') {
		if (typeof importedFunctions !== 'object' || !importedFunctions ||
			!Object.values(importedFunctions).every(v => (
				(Array.isArray(v) && typeof v[0] === 'function' && typeof v[1] === 'object')
				|| typeof v === 'function'
			))
		) {
			throw new Error('Error: failed to load module specified in \'functions\' option: imported value is not a function map.');
		}
		options.functions = importedFunctions;
	}

	// FILTERS
	const importedFilters = await tryImportModuleCli('filters', options.filters);
	if (typeof importedFilters !== 'undefined') {
		if (typeof importedFilters !== 'object' || !importedFilters ||
			!Object.values(importedFilters).every(v => (
				(Array.isArray(v) && typeof v[0] === 'function' && typeof v[1] === 'object')
				|| typeof v === 'function'
			))
		) {
			throw new Error('Error: failed to load module specified in \'filters\' option: imported value is not a function map.');
		}
		options.filters = importedFilters;
	}

	// ADVANCED
	const importedAdvanced = await tryImportModuleCli('advanced', options.advanced);
	if (typeof importedAdvanced !== 'undefined') {
		if (typeof importedAdvanced !== 'function') {
			throw new Error('Error: failed to load module specified in \'advanced\' option: imported value is not a function.');
		}
		options.advanced = importedAdvanced;
	}

	await fileWriterOptionsFromCliParameters(options);
};

export const ejsWriterOptionsFromCliParameters = async (options: Record<string, unknown>) => {
	// VIEW
	if (typeof options.view === 'string') {
		options.view = tryParseFunction(options.view);
	}

	await fileWriterOptionsFromCliParameters(options);
};

export const parseArgs = async (module: string, args: any): Promise<Record<string, unknown>[]> => {
	const argArr = ensureArray(args);

	for (const arg of argArr) {
		switch (module) {
		case '@static-pages/file-writer':
			await fileWriterOptionsFromCliParameters(arg);
			break;
		case '@static-pages/twig-writer':
		case '@static-pages/nunjucks-writer':
			await twigWriterOptionsFromCliParameters(arg);
			break;
		case '@static-pages/ejs-writer':
		case '@static-pages/mustache-writer':
			await ejsWriterOptionsFromCliParameters(arg);
			break;
		}
	}

	return argArr;
};
