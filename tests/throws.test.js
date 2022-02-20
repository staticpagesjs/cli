const { execute } = require('./lib/execute');
const { getExpectedFile } = require('./lib/output');

test('08 expect no provided route defs', async () => {
	await expect(async () => {
		await execute(['-c', 'config/08-invalid-route.yaml']);
	})
		.rejects
		.toThrow(getExpectedFile('08-invalid-route/console.txt'));
});

test('09 expect missing route key: \'from\'', async () => {
	await expect(async () => {
		await execute(['-c', 'config/09-missing-from.yaml']);
	})
		.rejects
		.toThrow(getExpectedFile('09-missing-from/console.txt'));
});

test('10 expect missing route key: \'to\'', async () => {
	await expect(async () => {
		await execute(['-c', 'config/10-missing-to.yaml']);
	})
		.rejects
		.toThrow(getExpectedFile('10-missing-to/console.txt'));
});

test('11 expect invalid route key: \'from\'', async () => {
	await expect(async () => {
		await execute(['-c', 'config/11-invalid-from.yaml']);
	})
		.rejects
		.toThrow(getExpectedFile('11-invalid-from/console.txt'));
});

test('12 expect invalid route key: \'to\'', async () => {
	await expect(async () => {
		await execute(['-c', 'config/12-invalid-to.yaml']);
	})
		.rejects
		.toThrow(getExpectedFile('12-invalid-to/console.txt'));
});

test('13 expect non-existent config', async () => {
	await expect(async () => {
		await execute(['-c', 'config/13-nonexistent-config.yaml']);
	})
		.rejects
		.toThrow(getExpectedFile('13-nonexistent-config/console.txt'));
});
