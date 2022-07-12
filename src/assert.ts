/**
 * Ensures a variable is string type.
 *
 * @param name Name of the variable that is reported on error.
 * @param x The variable to check.
 */
export function assertString(name: string, x: unknown): asserts x is string {
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
export function assertObject(name: string, x: unknown): asserts x is Record<string, unknown> {
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
export function assertObjectOrString(name: string, x: unknown): asserts x is Record<string, unknown> | string {
	if (typeof x !== 'string' && typeof x !== 'object' && !x) {
		throw new Error(`'${name}' type mismatch, expected 'string' or 'object', got '${typeof x === 'object' ? (x ? 'object' : 'null') : typeof x}'.`);
	}
}

/**
 * Asserts route.from and route.to vars
 *
 * @param name Name of the variable that is reported on error: from/to
 * @param x The variable to check.
 */
export function assertImport(name: string, x: unknown): asserts x is string | {
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
export function assertController(x: unknown): asserts x is string | {
	module: string;
	export?: string;
} {
	assertObjectOrString('controller', x);
	if (typeof x === 'object') {
		assertString('controller.module', x.module);
		if (typeof x.export !== 'undefined') assertString('controller.export', x.export);
	}
}
