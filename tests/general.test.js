const { afterEach, test, expect, } = require('jest');
const rimraf = require('rimraf');
const { execute } = require('./lib/execute');
const { getExpectedFile, getExpectedOutput, getProducedOutput } = require('./lib/output');

afterEach(() => {
	rimraf.sync(__dirname + '/temp');
});

test('01 it prints the help page', async () => {
	const output = await execute(['--help']);

	expect(output).toStrictEqual(getExpectedFile('01-help-switch/console.txt'));
});

test('02 simple passtrough', async () => {
	await execute(['-c', 'config/02-simple-pass.yaml']);

	expect(getExpectedOutput('02-simple-pass')).toStrictEqual(getProducedOutput());
});

test('03 multiple passtrough with extended from and to', async () => {
	await execute(['-c', 'config/03-multi-pass.yaml']);

	expect(getExpectedOutput('03-multi-pass')).toStrictEqual(getProducedOutput());
});

test('04 controller import test', async () => {
	await execute(['-c', 'config/04-controller-test.yaml']);

	expect(getExpectedOutput('04-controller-test')).toStrictEqual(getProducedOutput());
});

test('05 controller can access config', async () => {
	await execute(['-c', 'config/05-controller-context.yaml']);

	expect(getExpectedOutput('05-controller-context')).toStrictEqual(getProducedOutput());
});

test('06 controller import cli() when exists', async () => {
	await execute(['-c', 'config/06-controller-cli.yaml']);

	expect(getExpectedOutput('06-controller-cli')).toStrictEqual(getProducedOutput());
});

test('07 controller import default() when exists', async () => {
	await execute(['-c', 'config/07-controller-default.yaml']);

	expect(getExpectedOutput('07-controller-default')).toStrictEqual(getProducedOutput());
});

test('17 controller import myCustomController() when exists', async () => {
	await execute(['-c', 'config/17-controller-custom.yaml']);

	expect(getExpectedOutput('17-controller-custom')).toStrictEqual(getProducedOutput());
});
