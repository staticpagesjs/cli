const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, '../temp');

module.exports = () => (d) => {
    fs.mkdirSync(outPath, { recursive: true });
    fs.writeFileSync(path.join(outPath, (d.output || d.source || 'default') + '.out'), `OUTPUT BEGIN --\n${JSON.stringify(d, null, 4)}\nOUTPUT END ---`);
};
