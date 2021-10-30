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
  .option('-f, --from <package>', 'import \'cli\' or \'default\' from this package as the reader')
  .option('-a, --from-args <JSON-string>', 'arguments passed to reader; provide in JSON format')
  .option('-t, --to <package>', 'import \'cli\' or \'default\' from this package as the writer')
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
const assertType = (name: string, x: any, ...desiredType: string[]): void => {
  const actualType = typeof x === 'object' ? (x ? 'object' : 'null') : typeof x;
  if (!desiredType.includes(actualType))
    throw new Error(`'${name}' type mismatch, expected '${desiredType.join("', '")}', got '${actualType}'.`);
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
 * @param preferredImport Preferred import, if not exists fallbacks to default, then a cjs function export.
 * @returns Module exports.
 */
const importCliModule = (file: any, preferredImport: string = 'cli'): unknown => {
  try {
    const mod: any = importFrom(process.cwd(), file);
    if (mod[preferredImport]) return mod[preferredImport];
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
  assertType('route.from', route.from, 'object', 'string');
  assertType('route.to', route.to, 'object', 'string');

  const fromModuleKey = typeof from === 'object' ? 'route.from.module' : 'route.from';
  const fromModuleName = typeof from === 'object' ? from.module : from;
  const fromImportName = typeof from === 'object' ? from.import : 'cli';
  const fromArgs = typeof from === 'object' ? from.args : undefined;

  const toModuleKey = typeof to === 'object' ? 'route.to.module' : 'route.to';
  const toModuleName = typeof to === 'object' ? to.module : to;
  const toImportName = typeof to === 'object' ? to.import : 'cli';
  const toArgs = typeof to === 'object' ? to.args : undefined;

  assertType(fromModuleKey, fromModuleName, 'string');
  assertType(toModuleKey, toModuleName, 'string');

  // Construct the route object accepted by the core.
  const fromFactory = importCliModule(fromModuleName, fromImportName);
  if (typeof fromFactory !== 'function')
    throw new Error(`'${fromModuleKey}' of '${fromModuleName}' does not exports a function.`);

  const fromIterable = await fromFactory.apply(undefined, ensureArray(fromArgs));
  if (!(Symbol.iterator in fromIterable || Symbol.asyncIterator in fromIterable))
    throw new Error(`'${fromModuleKey}' of '${fromModuleName}' does not provide an iterable or async iterable.`);

  const toFactory = importCliModule(toModuleName, toImportName);
  if (typeof toFactory !== 'function')
    throw new Error(`'${toModuleKey}' of '${toModuleName}' does not exports a function.`);

  const toWriter = await toFactory.apply(undefined, ensureArray(toArgs));
  if (typeof toWriter !== 'function')
    throw new Error(`'${toModuleKey}' of '${toModuleName}' does not provide a function after initialization.`);

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

/**
 * Reads configuration from yaml file.
 *
 * @param file Path to the configuration file.
 * @returns Route definitions.
 */
function routeFromFile(file: string): Promise<Route[]> {
  if (!fs.existsSync(file)) {
    throw new Error(`Configuration file does not exists: ${file}`);
  }
  try {
    return Promise.all(
      ensureArray(yaml.load(fs.readFileSync(file, 'utf-8')))
        .map(x => prepareRoute(x))
    );
  } catch (error: any) {
    throw new Error(`Could not prepare configuration: ${error.message || error}`);
  }
}

/**
 * Reads configuration provided by the cli.
 *
 * @param fromModule Package name of the reader.
 * @param fromArgs Args passed to the reader factory.
 * @param toModule Package name of the writer.
 * @param toArgs Args passed to the writer factory.
 * @param context Context params of the controller.
 * @returns Route definitions.
 */
async function routeFromArgs(
  fromModule: string,
  fromArgs: string,
  toModule: string,
  toArgs: string,
  context: Record<string, unknown>
): Promise<Route[]> {
  return [await prepareRoute({
    from: {
      module: fromModule,
      args: fromArgs,
    },
    to: {
      module: toModule,
      args: toArgs,
    },
    controller: controller,
    ...context,
  })];
}

const opts = program.opts();
const { config, from, fromArgs, to, toArgs, controller, context } = opts;

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

  let routes;
  if (config) {
    // from config file via --config
    routes = await routeFromFile(config);
  } else if (Object.keys(opts).length > 0) {
    // from command line options
    routes = await routeFromArgs(from, fromArgsParsed, to, toArgsParsed, contextParsed);
  } else {
    program.help();
  }

  // The work.
  await staticPages(routes);

})()
  .catch(
    (error: any) => { console.error(error.message || error); }
  );
