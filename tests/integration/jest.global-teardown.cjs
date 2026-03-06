const fs = require("node:fs");
const path = require("node:path");

const runtimeDir = path.resolve(__dirname, ".runtime");
const stateFile = path.join(runtimeDir, "mongo-state.json");

module.exports = async () => {
  if (global.__AMS_JEST_MONGO__) {
    await global.__AMS_JEST_MONGO__.stop();
  }

  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }
};
