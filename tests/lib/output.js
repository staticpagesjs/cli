const fs = require('fs');
const path = require('path');

const expectedPath = path.join(__dirname, '../expected');
const producedPath = path.join(__dirname, '../temp');

function getExpectedOutput(...args) {
  return fs.readFileSync(path.join(expectedPath, ...args), 'utf-8');
}

function getProducedOutput(...args) {
  return fs.readFileSync(path.join(producedPath, ...args), 'utf-8');
}

module.exports = { getExpectedOutput, getProducedOutput };
