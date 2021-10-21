#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as importFrom from 'import-from';
import staticPages, { Route } from '@static-pages/core';

const pkg = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf-8'));

program
  .name(Object.keys(pkg.bin)[0])
  .version(pkg.version, '-v, --version', 'output the current cli version')
  .option('-c, --config <path>', 'path to a build configuration file')
  .option('-r, --from-reader <package>', 'import default from this package as the reader')
  .option('-a, --from-args <JSON-string>', 'arguments passed to reader; provide in JSON format')
  .option('-w, --to-writer <package>', 'import default from this package as the writer')
  .option('-A, --to-args <JSON-string>', 'arguments passed to writer; provide in JSON format')
  .option('-s, --controller <package>', 'controller that can process the input data before rendering')
  .option('-x, --context <JSON-string>', 'additional object that will be passed to the controller as \'this\'')
  .parse();

/**
 * Gets the type name of a variable.
 * Similar to `typeof x` except `null` is reported as `null`, not `object`.
 * 
 * @param x Target which type is in question.
 * @returns Type name like `object`, `string`, 'function`, `number`, `null` etc.
 */
const getType = (x: any): string => typeof x === 'object' ? (x ? 'object' : 'null') : typeof x;

/**
 * Ensures that the given object is an array.
 * Wraps it in array if its not an array.
 * @param x Any object.
 * @returns Array.
 */
const ensureArray = (x: any): unknown[] => Array.isArray(x) ? x : [x];

/**
 * Imports a CommonJS module, relative from the process.cwd().
 * 
 * @param file Module path.
 * @returns Module exports.
 */
const importCliModule = (file: any): unknown => {
  try {
    const mod: any = importFrom(process.cwd(), file);
    if (mod.cli) return mod.cli;
    if (mod.default) return mod.default;
    return mod;
  } catch (error: any) {
    throw new Error(`Failed to load module '${file}': ${error.message || error}\n${error.stack ? 'Trace: ' + error.stack : 'No stack trace available.'}`);
  }
};

/**
 * Transforms stringified 'cli' route definitions into 'core' route definitions.
 * 
 * @param route CLI route definition where properties are strings and needs to be resolved to its corresponding types.
 * @returns Proper route definition accepted by static-pages/core.
 */
async function prepareRoute(route: any): Promise<Route> {
  const { from, to, controller, ...rest } = route;

  // Validate all required properties
  if (typeof route !== 'object' || !route)
    throw new Error(`Route type mismatch, expected 'object', got '${getType(route)}'.`);

  if (typeof from !== 'object' || !from)
    throw new Error(`'route.from' type mismatch, expected 'object', got '${getType(from)}'.`);

  if (typeof from.reader !== 'string')
    throw new Error(`'route.from.reader' type mismatch, expected 'object', got '${getType(from.reader)}'.`);

  if (typeof to !== 'object' || !to)
    throw new Error(`'route.to' type mismatch, expected 'object', got '${getType(to)}'.`);

  if (typeof to.writer !== 'string')
    throw new Error(`'route.to.writer' type mismatch, expected 'object', got '${getType(to.writer)}'.`);

  // Construct the route object accepted by the core.
  const fromReader = importCliModule(from.reader);
  if (typeof fromReader !== 'function')
    throw new Error(`'route.from.reader' of '${from.reader}' does not exports a function.`);

  const fromIterable = await fromReader.apply(undefined, ensureArray(from.args));
  if (!(Symbol.iterator in fromIterable || Symbol.asyncIterator in fromIterable))
    throw new Error(`'route.from.reader' of '${from.reader}' does not provide an iterable or async iterable.`);

  const toWriterInitializer = importCliModule(to.writer);
  if (typeof toWriterInitializer !== 'function')
    throw new Error(`'route.to.writer' of '${to.writer}' does not exports a function.`);

  const toWriter = await toWriterInitializer.apply(undefined, ensureArray(to.args));
  if (typeof toWriter !== 'function')
    throw new Error(`'route.to.writer' of '${to.writer}' does not provide a function after initialization.`);

  const controllerFn = typeof controller === 'string' ? importCliModule(controller) : undefined;
  if (controllerFn && typeof controllerFn !== 'function')
    throw new Error(`'route.controller' of '${controller}' does not provide a function.`);

  return {
    from: fromIterable,
    to: toWriter,
    controller: controllerFn,
    ...rest,
  };
}

const opts = program.opts();
const { config, fromReader, fromArgs, toWriter, toArgs, controller, context } = opts;

(async () => {
  let fromArgsParsed = undefined;
  try {
    if (fromArgs) fromArgsParsed = JSON.parse(fromArgs);
  } catch (error: any) {
    throw new Error(`Could not parse --from-args: ${error.message || error}`);
  }

  let toArgsParsed = undefined;
  try {
    if (toArgs) toArgsParsed = JSON.parse(toArgs);
  } catch (error: any) {
    throw new Error(`Could not parse --to-args: ${error.message || error}`);
  }

  let contextParsed = undefined;
  try {
    if (context) contextParsed = JSON.parse(context);
  } catch (error: any) {
    throw new Error(`Could not parse --context: ${error.message || error}`);
  }

  if (config) { // from config file via --config
    if (!fs.existsSync(config)) {
      throw new Error(`Configuration file does not exists: ${config}`);
    }
    try {
      var routes = await Promise.all(
        ensureArray(yaml.load(fs.readFileSync(config, 'utf-8')))
          .map(x => prepareRoute(x))
      );
    } catch (error: any) {
      throw new Error(`Could not prepare configuration: ${error.message || error}`);
    }
  } else if (Object.keys(opts).length > 0) { // from command line options
    var routes = [await prepareRoute({
      from: {
        reader: fromReader,
        args: fromArgsParsed,
      },
      to: {
        writer: toWriter,
        args: toArgsParsed,
      },
      controller: controller,
      ...contextParsed,
    })];
  } else {
    program.help();
  }

  // The work.
  await staticPages(routes);

})()
  .catch(
    (error: any) => { console.error(error.message || error); }
  );
