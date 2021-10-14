const rimraf = require('rimraf');
const { execute } = require('./lib/execute');
const { getExpectedOutput, getProducedOutput } = require('./lib/output');

afterEach(() => {
  rimraf.sync(__dirname + '/temp');
});

test('it prints the help page', async () => {
  const expected = getExpectedOutput('help.txt');
  const output = await execute(['--help']);

  expect(output).toStrictEqual(expected);
});

test('simple passtrough', async () => {
  const expected = [
    getExpectedOutput('01-simple-pass/page1.json.out'),
    getExpectedOutput('01-simple-pass/page2.json.out'),
  ];
  await execute(['-c', 'config/01-simple.yaml']);
  const output = [
    getProducedOutput('page1.json.out'),
    getProducedOutput('page2.json.out'),
  ];

  expect(output).toStrictEqual(expected);
});
