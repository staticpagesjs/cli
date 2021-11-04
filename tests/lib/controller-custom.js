module.exports = {
  myCustomController(d) {
    return { ...d, addedPropertyByController: true };
  }
};
