/**
 * Ensures that the given object is an array.
 * Wraps it in array if its not an array.
 *
 * @param x Any object.
 * @returns Array.
 */
export const ensureArray = <T>(x: T | T[]): T[] => Array.isArray(x) ? x : [x];
