#!/usr/bin/env node

import 'dotenv/config';

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as minimist from 'minimist';
import { staticPages, Route } from '@static-pages/core';

import { parseRoute } from './parse-route';

let hasUnknownArgs = false;
const knownArguments = [
	/^-c$/, /^--config$/,
	/^-h$/, /^--help$/,
	/^-v$/, /^--version$/,
	/^--(:?from|to)(?:\.module|\.export|\.args\.(?:[a-zA-Z0-9_-]+\.?)*[a-zA-Z0-9_-]+)?$/,
	/^--controller(?:\.module|\.export)?$/,
	/^--variables\.(?:[a-zA-Z0-9_-]+\.?)*[a-zA-Z0-9_-]+$/,
];

const argv = minimist(process.argv.slice(2), {
	alias: {
		c: 'config',
		h: 'help',
		v: 'version',
	},
	boolean: [
		'help',
		'version',
	],
	unknown(arg) {
		if (!arg.startsWith('-') || knownArguments.every(pattern => !pattern.test(arg))) {
			console.error(`Unknown argument: ${arg}`);
			hasUnknownArgs = true;
			return false;
		}
		return true;
	},
});

if (hasUnknownArgs) {
	console.error('\nSee --help for usage.');
	process.exit(1);
}

/**
 * Reads configuration from yaml file.
 *
 * @param file Path to the configuration file.
 * @returns Route definitions.
 */
function routesFromFile(file: string) {
	if (!fs.existsSync(file)) {
		throw new Error(`Configuration file does not exists: ${file}`);
	}
	try {
		const config = yaml.load(fs.readFileSync(file, 'utf-8'));
		return Promise.all(
			(Array.isArray(config) ? config : [config])
				.map(x => parseRoute(x))
		);
	} catch (error: unknown) {
		throw new Error(`Could not prepare configuration: ${error instanceof Error ? error.message : error}`);
	}
}

(async () => {
	let routes: Route[];
	if (argv.version) {
		console.log(JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf-8')).version);
		process.exit(0);
	} else if (argv.config) {
		routes = await routesFromFile(argv.config);
	} else if (argv.from || argv.to || argv.controller || argv.variables) {
		routes = [await parseRoute(argv)];
	} else { // when --help is supplied or when no args present
		console.log(fs.readFileSync(__dirname + '/../HELP.txt', 'utf-8'));
		process.exit(0);
	}

	// The work.
	await staticPages(routes);

})()
	.catch(err => {
		console.error(err?.message ?? err);
		process.exit(1);
	});
