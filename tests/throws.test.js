const { execute } = require('./lib/execute');
const { getExpectedFile } = require('./lib/output');

test('08 no provided route defs', async () => {
  await expect(async () => {
    await execute(['-c', 'config/08-invalid-route.yaml']);
  })
    .rejects
    .toThrow();
});
