import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll } from "vitest";

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

export function setupInMemoryMongo() {
  beforeAll(async () => {
    state.activeSuites += 1;

    if (!state.mongoServer) {
      state.mongoServer = await MongoMemoryServer.create();
    }

    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(state.mongoServer.getUri(), {
        dbName: "vitest-models",
      });
    }
  });

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
  });
}
