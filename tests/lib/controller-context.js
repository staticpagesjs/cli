module.exports = function (d) {
	if (this.configValue !== 'foo bar') {
		throw new Error(`Controller can not access configuration property 'configValue'.`);
	}
	return d;
};
