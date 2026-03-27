const fs = require("node:fs");
const path = require("node:path");
const { MongoMemoryServer } = require("mongodb-memory-server");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const testCacheRoot = path.resolve(workspaceRoot, "..", ".ams-test-cache", path.basename(workspaceRoot));
const runtimeDir = path.join(testCacheRoot, "integration");
const stateFile = path.join(runtimeDir, "mongo-state.json");
const mongoCacheDir = path.join(testCacheRoot, "mongodb-binaries");
const mongoDbPath = path.join(runtimeDir, "mongo-db");
const defaultWindowsMongoPath = "C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe";

function resolveBinaryConfig() {
  const systemBinary =
    process.env.MONGOMS_SYSTEM_BINARY ||
    (fs.existsSync(defaultWindowsMongoPath) ? defaultWindowsMongoPath : undefined);

  if (systemBinary) {
    return { systemBinary };
  }

  return {
    version: process.env.MONGOMS_VERSION || "7.0.14",
  };
}

module.exports = async () => {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(mongoDbPath, { recursive: true });
  const binaryConfig = resolveBinaryConfig();

  if (!("systemBinary" in binaryConfig)) {
    fs.mkdirSync(mongoCacheDir, { recursive: true });
  }

  const mongo = await MongoMemoryServer.create({
    binary: {
      ...binaryConfig,
      downloadDir: mongoCacheDir,
    },
    instance: {
      dbName: "ams_integration",
      dbPath: mongoDbPath,
    },
  });

  global.__AMS_JEST_MONGO__ = mongo;

  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        mongoUri: mongo.getUri(),
        dbName: "ams_integration",
        mongoDbPath,
      },
      null,
      2
    ),
    "utf8"
  );
};
