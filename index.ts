#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import staticPages, { Route } from '@static-pages/core';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

program
  .name(Object.keys(pkg.bin)[0])
  .version(pkg.version, '-v, --version', 'output the current cli version')
  .option('-c, --config <path>', 'path to a build configuration file')
  .option('-r, --from-reader <package>', 'import default from this package as the reader')
  .option('-a, --from-args <options>', 'arguments passed to reader; provide in JSON format')
  .option('-w, --to-writer <package>', 'import default from this package as the writer')
  .option('-A, --to-args <options>', 'arguments passed to writer; provide in JSON format')
  .option('-s, --controller <package>', 'controller that can process the input data before rendering')
  .parse();

const opts = program.opts();
const { config, fromReader, fromArgs, toWriter, toArgs, controller } = opts;

(async () => {
  if (config) {
    if (!fs.existsSync(config)) {
      throw new Error(`Configuration file does not exists: ${config}`);
    }
    try {
      var routes = yaml.load(fs.readFileSync(config, 'utf-8')) as Route | Route[];
    } catch (error) {
      throw new Error(`Could not parse configuration file: ${error}`);
    }
  } else if (Object.keys(opts).length > 0) {
    // TODO: config case needs these too; eg. async function prepareRoute()
    if (!fromReader) throw new Error(`No --from-reader provided. See --help.`);
    if (!toWriter) throw new Error(`No --to-writer provided. See --help.`);

    const __importDefault = (mod: any): any => mod.default ? mod.default : mod;

    try {
      var reader = __importDefault(await import(fromReader));
    } catch (error) {
      throw new Error(`Could not load --from-reader: ${error}`);
    }

    try {
      var writer = __importDefault(await import(toWriter));
    } catch (error) {
      throw new Error(`Could not load --to-writer: ${error}`);
    }



    var routes = {
      from:
    } as Route | Route[];

  } else {
    program.help();
  }

  console.log(opts, routes);
  //await staticPages(routes);

})().catch(console.error);
