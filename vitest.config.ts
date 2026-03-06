import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = path.resolve(__dirname);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "client/src"),
    },
  },
  test: {
    globals: true,
    passWithNoTests: true,
    environment: "node",
    environmentMatchGlobs: [["tests/components/**", "jsdom"]],
    setupFiles: ["./tests/components/setup.ts"],
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/unit/**/*.spec.{ts,tsx}",
      "tests/components/**/*.test.{ts,tsx}",
      "tests/components/**/*.spec.{ts,tsx}",
    ],
    exclude: [
      "tests/integration/**",
      "tests/e2e/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
    ],
    css: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage/vitest",
      reporter: ["text", "html", "lcov"],
      include: ["client/src/**/*.{ts,tsx}", "server/src/**/*.{ts,tsx}"],
      exclude: ["**/*.d.ts", "server/src/server.ts"],
    },
  },
});
