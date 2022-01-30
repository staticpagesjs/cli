const fs = require('fs');
const path = require('path');

module.exports = () => {
	const files = fs.readdirSync(path.join(__dirname, '../data'));
	return files.map(
		fileName => {
			const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data', fileName), 'utf-8'));
			return { source: fileName, ...data };
		}
	);
};
