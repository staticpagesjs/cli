const fs = require('fs');
const path = require('path');

module.exports = ({ file }) => {
	return [{
		source: file,
		...JSON.parse(fs.readFileSync(path.join(__dirname, '../data', file), 'utf-8'))
	}];
};
