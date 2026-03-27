import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: path.resolve(__dirname, "e2e"),
  outputDir: path.resolve(__dirname, "test-results", "test-results"),
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  testIgnore: ["**/start-server.mjs", "**/seed.ts"],
  expect: {
    timeout: 5_000,
  },
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: path.resolve(__dirname, "test-results", "playwright-report"),
      },
    ],
  ],
  use: {
    baseURL: "http://localhost:8081",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 14"], browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node ./tests/e2e/start-server.mjs",
      cwd: workspaceRoot,
      url: "http://localhost:5001/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:client",
      cwd: workspaceRoot,
      url: "http://localhost:8081",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_API_BASE_URL: "http://localhost:5001/api",
        VITE_API_PROXY_TARGET: "http://localhost:5001",
        VITE_DEV_PORT: "8081",
      },
    },
  ],
});
