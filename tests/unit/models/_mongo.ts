import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll } from "vitest";

const DEFAULT_MONGOMS_VERSION = "7.0.14";
const MONGO_HOOK_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_WINDOWS_MONGOD_PATH = "C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe";
const REPO_ROOT = path.resolve(process.cwd());
const TEST_CACHE_ROOT = path.resolve(REPO_ROOT, "..", ".ams-test-cache", path.basename(REPO_ROOT));
const MONGO_CACHE_DIR = path.join(TEST_CACHE_ROOT, "mongodb-binaries");
const MONGO_DBPATH = path.join(TEST_CACHE_ROOT, "mongo-dbpaths", `vitest-models-${process.pid}`);

type MongoTestState = {
  mongoServer: MongoMemoryServer | null;
  activeSuites: number;
};

const globalState = globalThis as typeof globalThis & {
  __vitestMongoState?: MongoTestState;
};

const state =
  globalState.__vitestMongoState ??
  (globalState.__vitestMongoState = {
    mongoServer: null,
    activeSuites: 0,
  });

function resolveMongoBinaryConfig() {
  const systemBinary =
    process.env.MONGOMS_SYSTEM_BINARY ||
    (existsSync(DEFAULT_WINDOWS_MONGOD_PATH) ? DEFAULT_WINDOWS_MONGOD_PATH : undefined);

  if (systemBinary) {
    return { systemBinary };
  }

  return {
    version: process.env.MONGOMS_VERSION || DEFAULT_MONGOMS_VERSION,
  };
}

export function setupInMemoryMongo() {
  beforeAll(async () => {
    state.activeSuites += 1;
    mkdirSync(MONGO_DBPATH, { recursive: true });
    const mongoBinaryConfig = resolveMongoBinaryConfig();

    if (!("systemBinary" in mongoBinaryConfig)) {
      mkdirSync(MONGO_CACHE_DIR, { recursive: true });
    }

    if (!state.mongoServer) {
      state.mongoServer = await MongoMemoryServer.create({
        binary: {
          ...mongoBinaryConfig,
          downloadDir: MONGO_CACHE_DIR,
        },
        instance: {
          dbPath: MONGO_DBPATH,
        },
      });
    }

    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(state.mongoServer.getUri(), {
        dbName: "vitest-models",
      });
    }
  }, MONGO_HOOK_TIMEOUT_MS);

  afterEach(async () => {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    state.activeSuites = Math.max(0, state.activeSuites - 1);
    if (state.activeSuites === 0) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      if (state.mongoServer) {
        await state.mongoServer.stop();
        state.mongoServer = null;
      }
    }
    rmSync(MONGO_DBPATH, { recursive: true, force: true });
  }, MONGO_HOOK_TIMEOUT_MS);
}
