const fs = require("node:fs");
const path = require("node:path");

const runtimeDir = path.resolve(__dirname, ".runtime");
const stateFile = path.join(runtimeDir, "mongo-state.json");

process.env.NODE_ENV = "test";
process.env.LOAD_DOTENV_IN_TEST = "false";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "integration-test-jwt-secret-1234567890";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
process.env.MONGO_REQUIRE_REPLICA_SET =
  process.env.MONGO_REQUIRE_REPLICA_SET || "false";
process.env.RATE_LIMIT_BACKEND = process.env.RATE_LIMIT_BACKEND || "memory";
process.env.CORS_ORIGIN =
  process.env.CORS_ORIGIN || "http://127.0.0.1:8080,http://localhost:8080";

if (fs.existsSync(stateFile)) {
  const runtime = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (runtime.mongoUri) {
    process.env.MONGO_URI = runtime.mongoUri;
  }
}
