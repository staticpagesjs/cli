const fs = require('fs');
const path = require('path');

function getDirectoryData(baseDir, targetDir = '') {
	const files = fs.readdirSync(path.join(baseDir, targetDir));
	const result = {};
	for (const file of files) {
		const filePath = path.join(baseDir, targetDir, file);
		const relativeFilePath = path.join(targetDir, file);
		if (fs.statSync(filePath).isDirectory()) {
			result[relativeFilePath] = getDirectoryData(baseDir, relativeFilePath);
		} else {
			result[relativeFilePath] = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
		}
	}
	return result;
}

function getExpectedFile(...args) {
	return fs.readFileSync(path.join(__dirname, '../expected', ...args), 'utf-8').replace(/\r/g, '');
}

function getExpectedOutput(...args) {
	return getDirectoryData(path.join(__dirname, '../expected', ...args));
}

function getProducedOutput() {
	return getDirectoryData(path.join(__dirname, '../temp'));
}

module.exports = { getExpectedFile, getExpectedOutput, getProducedOutput };
