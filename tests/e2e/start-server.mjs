import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..");
const runtimePath = path.resolve(__dirname, "runtime.json");
const mongo = await MongoMemoryServer.create({
  instance: {
    dbName: "ams_e2e",
  },
});

fs.writeFileSync(
  runtimePath,
  JSON.stringify(
    {
      mongoUri: mongo.getUri(),
      createdAt: new Date().toISOString(),
    },
    null,
    2
  )
);

const serverProcess = spawn("npm run dev:server", [], {
  cwd: workspaceRoot,
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    LOAD_DOTENV_IN_TEST: "false",
    PORT: process.env.PORT || "5001",
    MONGO_URI: mongo.getUri(),
    MONGO_REQUIRE_REPLICA_SET: "false",
    JWT_SECRET:
      process.env.JWT_SECRET || "playwright-e2e-jwt-secret-1234567890",
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1h",
    RATE_LIMIT_BACKEND: process.env.RATE_LIMIT_BACKEND || "mongo",
    CORS_ORIGIN:
      process.env.CORS_ORIGIN ||
      "http://127.0.0.1:8080,http://localhost:8080,http://127.0.0.1:4173",
  },
});

let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (serverProcess.exitCode === null) {
    serverProcess.kill(signal);
  }

  await mongo.stop();
  if (fs.existsSync(runtimePath)) {
    fs.unlinkSync(runtimePath);
  }
};

process.on("SIGINT", async () => {
  await shutdown("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown("SIGTERM");
  process.exit(0);
});

serverProcess.on("exit", async (code) => {
  await shutdown("SIGTERM");
  process.exit(code ?? 0);
});
