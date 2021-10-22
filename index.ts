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
 * Ensures a variable has the desired type.
 *
 * @param name Name of the variable that is reported on error.
 * @param x The variable to check.
 * @param desiredType The desired type.
 */
const assertType = (name: string, x: any, desiredType: string): void => {
  const actualType = typeof x === 'object' ? (x ? 'object' : 'null') : typeof x;
  if (actualType !== desiredType)
    throw new Error(`'${name}' type mismatch, expected '${desiredType}', got '${actualType}'.`);
};

/**
 * Ensures that the given object is an array.
 * Wraps it in array if its not an array.
 *
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
 * Resolves string properties of a 'cli' route into real objects used by 'core' route definitions.
 *
 * @param route CLI route definition where properties are strings and needs to be resolved to its corresponding types.
 * @returns Proper route definition accepted by static-pages/core.
 */
async function prepareRoute(route: any): Promise<Route> {
  const { from, to, controller, ...rest } = route;

  assertType('route', route, 'object');
  assertType('route.from', route.from, 'object');
  assertType('route.from.reader', route.from.reader, 'string');
  assertType('route.to', route.to, 'object');
  assertType('route.to.writer', route.to.writer, 'string');

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
