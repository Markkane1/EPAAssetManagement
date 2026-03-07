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
  "/rooms-sections",
  "/categories",
  "/vendors",
  "/projects",
  "/schemes",
  "/reports",
  "/compliance",
  "/inventory",
  "/requisitions",
  "/returns",
  "/settings",
  "/settings/notifications",
  "/settings/delegations",
  "/audit-logs",
  "/approval-matrix",
  "/user-permissions",
  "/user-management",
  "/user-activity",
  "/profile",
];

const employeeRoutes = [
  "/",
  "/my-assets",
  "/requisitions",
  "/returns",
  "/profile",
];

test.beforeEach(async () => {
  await seedE2E();
});

test.afterAll(async () => {
  await closeSeedConnection();
});

test.describe("Page smoke coverage", () => {
  test("should let an admin open every major top-level page without falling back to login", async ({ page }) => {
    await login(page, "admin@test.com", "AdminPass123!");
    await expect(page).toHaveURL("/");

    for (const path of adminRoutes) {
      await page.goto(path, { waitUntil: "commit" });
      await expect(page).not.toHaveURL(/\/login$/);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("should let an employee open employee routes and redirect assignments to my-assets", async ({ page }) => {
    await login(page, "testuser@test.com", "TestPass123!");
    await expect(page).toHaveURL("/");

    for (const path of employeeRoutes) {
      await page.goto(path, { waitUntil: "commit" });
      await expect(page).not.toHaveURL(/\/login$/);
      await expect(page.locator("body")).toBeVisible();
    }

    await page.goto("/assignments", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/my-assets$/);
  });

  test("should redirect back to login when the browser session is cleared after login", async ({ page, context }) => {
    await login(page, "admin@test.com", "AdminPass123!");
    await expect(page).toHaveURL("/");

    await context.clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto("/assets", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login$/);
  });
});
