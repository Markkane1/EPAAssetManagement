import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

/** @type {import('jest').Config} */
export default {
  rootDir,
  testEnvironment: "node",
  maxWorkers: 1,
  passWithNoTests: true,
  testMatch: [
    "<rootDir>/tests/integration/**/*.test.[jt]s",
    "<rootDir>/tests/integration/**/*.spec.[jt]s",
    "<rootDir>/tests/security/**/*.test.[jt]s",
    "<rootDir>/tests/security/**/*.spec.[jt]s",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: path.resolve(rootDir, "server/tsconfig.json"),
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
