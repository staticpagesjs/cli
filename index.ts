#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

program
  .name(Object.keys(pkg.bin)[0])
  .version(pkg.version, '-v, --version', 'output the current version')
  .option('-c, --config <path>', 'path to a build configuration file')
  .parse();

console.log(program.opts());
