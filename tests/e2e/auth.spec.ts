import { expect, test } from "@playwright/test";

import { closeSeedConnection, seedE2E } from "./seed";
import { expectProtectedRedirect, login, solveCaptcha } from "./helpers";

test.beforeEach(async () => {
  await seedE2E();
});

test.afterAll(async () => {
  await closeSeedConnection();
});

test.describe("Authentication flows", () => {
  test("should log in with valid admin credentials and reach the dashboard", async ({ page }) => {
    await login(page, "admin@test.com", "AdminPass123!");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("should show an error and stay on the login page when the password is wrong", async ({ page }) => {
    await login(page, "admin@test.com", "WrongPass123!");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/invalid credentials|failed to login/i)).toBeVisible();
  });

  test("should show validation errors when the login form is submitted with empty fields", async ({ page }) => {
    await page.goto("/login");
    await solveCaptcha(page);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect
      .poll(() => page.getByLabel("Email").evaluate((input) => (input as HTMLInputElement).validationMessage.length))
      .toBeGreaterThan(0);
    await expect
      .poll(() => page.getByLabel("Password").evaluate((input) => (input as HTMLInputElement).validationMessage.length))
      .toBeGreaterThan(0);
  });

  test("should log out and redirect protected pages back to login", async ({ page }) => {
    await login(page, "admin@test.com", "AdminPass123!");
    await expect(page).toHaveURL("/");

    await page.locator("header button").last().click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("user")))
      .toBeNull();
    await expectProtectedRedirect(page, "/assets");
  });

  test("should redirect logged-out users away from protected routes", async ({ page }) => {
    const protectedPaths = [
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
      "/requisitions",
      "/returns",
      "/settings",
      "/audit-logs",
      "/approval-matrix",
      "/user-permissions",
      "/user-management",
      "/user-activity",
      "/profile",
    ];

    for (const path of protectedPaths) {
      await expectProtectedRedirect(page, path);
    }
  });
});
