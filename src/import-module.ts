/* eslint-disable @typescript-eslint/no-explicit-any */
import * as importFrom from 'import-from';

type ModuleConfig = string | {
	module: string;
	export?: string;
};

/**
 * Imports an ES or CJS module, relative from the process.cwd().
 */
export const importModule = async (moduleConfig: ModuleConfig): Promise<unknown> => {
	if (typeof moduleConfig === 'string')
		moduleConfig = { module: moduleConfig };

	const { module: moduleName, export: exportName = 'default' } = moduleConfig;

	try {
		const module: any = importFrom(process.cwd(), moduleName);
		return module[exportName] ?? module.default?.[exportName] ?? module.default ?? module;
	} catch (error: unknown) {
		throw new Error(`Failed to load module '${moduleName}': ${error instanceof Error ? error.message : error}\n${error instanceof Error ? 'Trace: ' + error.stack : 'No stack trace available.'}`);
	}
};
