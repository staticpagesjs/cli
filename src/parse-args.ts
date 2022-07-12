import { Script } from 'vm';

import { assertImport } from './assert.js';
import { importModule } from './import-module.js';

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
					arg[k.substring(0, k.length - 7)] = importModule(v);
					delete arg[k];
				}
			}
		}
	}
};

export const parseArgs = async (args: unknown) => {
	if (!isObject(args)) return [];

	const argArr = Array.isArray(args) ? args : [args];

	for (const arg of argArr) {
		subparseArg(arg);
	}

	return argArr;
};
