const rimraf = require('rimraf');
const { execute } = require('./lib/execute');
const { getExpectedOutput, getProducedOutput } = require('./lib/output');

afterEach(() => {
	rimraf.sync(__dirname + '/temp');
});

test('14 simple passtrough from console input', async () => {
	await execute(['--from', './lib/reader-all', '--to', './lib/writer']);

	expect(getExpectedOutput('14-simple-pass-cli')).toStrictEqual(getProducedOutput());
});

test('15 controller from cli input', async () => {
	await execute(['--from', './lib/reader-all', '--to', './lib/writer', '--controller', './lib/controller-prop']);

	expect(getExpectedOutput('15-controller-test-cli')).toStrictEqual(getProducedOutput());
});

test('16 controller context value acces from cli input', async () => {
	await execute(['--from', './lib/reader-all', '--to', './lib/writer', '--controller', './lib/controller-context', '--variables.configValue', 'foo bar']);

	expect(getExpectedOutput('16-controller-context-cli')).toStrictEqual(getProducedOutput());
});
