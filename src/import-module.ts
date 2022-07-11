import * as importFrom from 'import-from';

/**
 * Imports an ES or CJS module, relative from the process.cwd().
 *
 * @param moduleName Module path.
 * @param exportName Preferred export, if not exists fallbacks to default, then a cjs function export.
 * @returns Module exports.
 */
export const importModule = async (moduleName: string, exportName = 'default'): Promise<unknown> => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const module: any = importFrom(process.cwd(), moduleName);
		return module[exportName] ?? module.default?.[exportName] ?? module.default ?? module;
	} catch (error: unknown) {
		throw new Error(`Failed to load module '${moduleName}': ${error instanceof Error ? error.message : error}\n${error instanceof Error ? 'Trace: ' + error.stack : 'No stack trace available.'}`);
	}
};
