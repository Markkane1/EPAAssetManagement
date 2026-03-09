import { expect, test } from "@playwright/test";

import { closeSeedConnection, seedE2E } from "./seed";
import { login } from "./helpers";

const adminRoutes = [
  "/",
  "/assets",
  "/asset-items",
  "/employees",
  "/assignments",
  "/transfers",
  "/maintenance",
  "/purchase-orders",
  "/offices",
  "/categories",
  "/vendors",
  "/projects",
  "/reports",
  "/requisitions",
  "/returns",
  "/settings",
  "/audit-logs",
  "/user-management",
  "/profile",
];

const employeeRoutes = ["/", "/my-assets", "/requisitions", "/returns", "/profile"];

test.beforeEach(async () => {
  await seedE2E();
});

test.afterAll(async () => {
  await closeSeedConnection();
});

function attachConsoleCollectors(page: Parameters<typeof test>[0]["page"], bucket: string[]) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      bucket.push(`console:${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    bucket.push(`pageerror:${error.message}`);
  });
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && url.includes("/api/")) {
      bucket.push(`response:${status}:${url}`);
    }
  });
}

test.describe("console hygiene", () => {
  test("should avoid console and page errors across major admin pages", async ({ page }) => {
    const errors: string[] = [];

    await login(page, "admin@test.com", "AdminPass123!");
    attachConsoleCollectors(page, errors);
    await expect(page).toHaveURL("/");

    for (const path of adminRoutes) {
      await page.goto(path, { waitUntil: "commit" });
      await expect(page).not.toHaveURL(/\/login$/);
      await expect(page.locator("body")).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test("should avoid console and page errors across employee pages", async ({ page }) => {
    const errors: string[] = [];

    await login(page, "testuser@test.com", "TestPass123!");
    attachConsoleCollectors(page, errors);
    await expect(page).toHaveURL("/");

    for (const path of employeeRoutes) {
      await page.goto(path, { waitUntil: "commit" });
      await expect(page).not.toHaveURL(/\/login$/);
      await expect(page.locator("body")).toBeVisible();
    }

    expect(errors).toEqual([]);
  });
});
