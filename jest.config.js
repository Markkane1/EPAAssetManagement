import path from "node:path";

/** @type {import('jest').Config} */
export default {
  rootDir: ".",
  testEnvironment: "node",
  maxWorkers: 1,
  passWithNoTests: true,
  testMatch: [
    "<rootDir>/tests/integration/**/*.test.[jt]s",
    "<rootDir>/tests/integration/**/*.spec.[jt]s",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: path.resolve("./server/tsconfig.json"),
        isolatedModules: true,
      },
    ],
  },
  setupFiles: ["<rootDir>/tests/integration/jest.env.cjs"],
  setupFilesAfterEnv: ["<rootDir>/tests/integration/jest.setup.ts"],
  globalSetup: "<rootDir>/tests/integration/jest.global-setup.cjs",
  globalTeardown: "<rootDir>/tests/integration/jest.global-teardown.cjs",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  collectCoverageFrom: [
    "server/src/**/*.{ts,js}",
    "!server/src/server.ts",
  ],
};
