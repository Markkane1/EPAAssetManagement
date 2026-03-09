import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  testIgnore: ["**/start-server.mjs", "**/seed.ts"],
  expect: {
    timeout: 5_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
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
      url: "http://localhost:5001/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:client",
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
