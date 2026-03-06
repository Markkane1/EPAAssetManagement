const fs = require("node:fs");
const path = require("node:path");
const { MongoMemoryServer } = require("mongodb-memory-server");

const runtimeDir = path.resolve(__dirname, ".runtime");
const stateFile = path.join(runtimeDir, "mongo-state.json");

module.exports = async () => {
  fs.mkdirSync(runtimeDir, { recursive: true });

  const mongo = await MongoMemoryServer.create({
    instance: {
      dbName: "ams_integration",
    },
  });

  global.__AMS_JEST_MONGO__ = mongo;

  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        mongoUri: mongo.getUri(),
        dbName: "ams_integration",
      },
      null,
      2
    ),
    "utf8"
  );
};
