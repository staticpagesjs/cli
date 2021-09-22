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
  .option('-t, --controller-this <JSON-string>', 'additional parameters that will be passed to the controller as \'this\'')
  .parse();

const getType = (x: any): string => typeof x === 'object' ? (x ? 'object' : 'null') : typeof x;
const ensureArray = (x: any): unknown[] => Array.isArray(x) ? x : [x];
const importDefaultOrRoot = (mod: any): unknown => mod.default ? mod.default : mod;
const prepareRoute = (route: any): Route => {
  // Validate all required properties
  if (typeof route !== 'object' || !route)
    throw new Error(`Route type mismatch, expected 'object', got '${getType(route)}'.`);

  if (typeof route.from !== 'object' || !route.from)
    throw new Error(`'route.from' type mismatch, expected 'object', got '${getType(route.from)}'.`);

  if (typeof route.from.reader !== 'string')
    throw new Error(`'route.from.reader' type mismatch, expected 'object', got '${getType(route.from.writer)}'.`);

  if (typeof route.to !== 'object' || !route.to)
    throw new Error(`'route.to' type mismatch, expected 'object', got '${getType(route.to)}'.`);

  if (typeof route.to.writer !== 'string')
    throw new Error(`'route.to.writer' type mismatch, expected 'object', got '${getType(route.to.writer)}'.`);

  // Construct the route object accepted by the core.
  const { from, to, controller, ...rest } = route;

  const fromReader = importDefaultOrRoot(importFrom(process.cwd(), from.reader));
  if (typeof fromReader !== 'function')
    throw new Error(`'route.from.reader' of '${from.reader}' does not exports a function.`);

  const fromIterable = fromReader.apply(undefined, ensureArray(from.args));
  if (!(Symbol.iterator in fromIterable || Symbol.asyncIterator in fromIterable))
    throw new Error(`'route.from.reader' of '${from.reader}' does not provide an iterable or async iterable.`);

  const toWriterInitializer = importDefaultOrRoot(importFrom(process.cwd(), to.writer));
  if (typeof toWriterInitializer !== 'function')
    throw new Error(`'route.to.writer' of '${to.writer}' does not exports a function.`);

  const toWriter = toWriterInitializer.apply(undefined, ensureArray(to.args));
  if (typeof toWriter !== 'function')
    throw new Error(`'route.to.writer' of '${to.writer}' does not provide a function after initialization.`);

  const controllerFn = typeof controller === 'string' ? importDefaultOrRoot(importFrom(process.cwd(), controller)) : undefined;
  if (controllerFn && typeof controllerFn !== 'function')
    throw new Error(`'route.controller' of '${controller}' does not provide a function.`);

  return {
    from: fromIterable,
    to: toWriter,
    controller: controllerFn,
    ...rest,
  };
};

const opts = program.opts();
const { config, fromReader, fromArgs, toWriter, toArgs, controller, controllerThis } = opts;

try {
  let fromArgsParsed = undefined;
  try {
    if (fromArgs) fromArgsParsed = JSON.parse(fromArgs);
  } catch (error) {
    throw new Error(`Could not parse --from-args: ${error}`);
  }

  let toArgsParsed = undefined;
  try {
    if (toArgs) toArgsParsed = JSON.parse(toArgs);
  } catch (error) {
    throw new Error(`Could not parse --to-args: ${error}`);
  }

  if (config) { // from config file via --config
    if (!fs.existsSync(config)) {
      throw new Error(`Configuration file does not exists: ${config}`);
    }
    try {
      var routes = ensureArray(yaml.load(fs.readFileSync(config, 'utf-8')))
        .map(x => prepareRoute(x));
    } catch (error) {
      throw new Error(`Could not prepare configuration: ${error}`);
    }
  } else if (Object.keys(opts).length > 0) { // from command line options
    var routes = [prepareRoute({
      from: {
        reader: fromReader,
        args: fromArgsParsed,
      },
      to: {
        writer: toWriter,
        args: fromArgsParsed,
      },
      controller: controller,
      ...(controllerThis ? JSON.parse(controllerThis) : undefined),
    })];
  } else {
    program.help();
  }

  // The work.
  staticPages(routes).catch(error => { throw error; });

} catch (error) {
  console.error(error.message || error);
}
