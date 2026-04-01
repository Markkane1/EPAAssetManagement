const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const testCacheRoot = path.resolve(workspaceRoot, "..", ".ams-test-cache", path.basename(workspaceRoot));
const runtimeDir = path.join(testCacheRoot, "integration");
const stateFile = path.join(runtimeDir, "mongo-state.json");

module.exports = async () => {
  if (global.__AMS_JEST_MONGO__) {
    await global.__AMS_JEST_MONGO__.stop();
  }

  let mongoDbPath = null;
  if (fs.existsSync(stateFile)) {
    try {
      const runtime = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (typeof runtime.mongoDbPath === "string" && runtime.mongoDbPath.trim().length > 0) {
        mongoDbPath = runtime.mongoDbPath;
      }
    } catch {
      mongoDbPath = null;
    }
  }

  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }

  if (mongoDbPath) {
    fs.rmSync(mongoDbPath, { recursive: true, force: true });
  }
};
