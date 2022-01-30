const path = require('path');
const spawn = require('child_process').spawn;
const concat = require('concat-stream');

const cliJs = path.join(__dirname, '../../index.js');
const workingDir = path.join(__dirname, '..');

function spawnCli(args = [], env = null) {
	return spawn('node', [cliJs, ...args], { NODE_ENV: 'test', cwd: workingDir, ...env });
}

function execute(args = [], opts = {}) {
	const { env = null } = opts;

	const childProcess = spawnCli(args, env);
	childProcess.stdin.setEncoding('utf-8');

	const promise = new Promise((resolve, reject) => {
		childProcess.stderr.once('data', err => {
			reject(new Error(err.toString()));
		});
		childProcess.on('error', reject);
		childProcess.stdout.pipe(
			concat(result => {
				resolve(result.toString());
			})
		);
	});

	return promise;
}

module.exports = { execute };
