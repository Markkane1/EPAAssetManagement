import { expect, test } from "@playwright/test";

import { closeSeedConnection, seedE2E } from "./seed";
import { expectAuthenticatedSession, login } from "./helpers";

const adminRoutes = [
  "/",
  "/assets",
  "/office/assets",
  "/asset-items",
  "/office/asset-items",
  "/consumables",
  "/consumables/receive",
  "/office/consumables/receive",
  "/consumables/containers",
  "/consumables/units",
  "/consumables/inventory",
  "/consumables/transfers",
  "/consumables/assignments",
  "/consumables/consume",
  "/consumables/adjustments",
  "/consumables/disposal",
  "/consumables/returns",
  "/consumables/ledger",
  "/consumables/expiry",
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
  "/reports/asset-summary",
  "/reports/asset-items-inventory",
  "/reports/assignment-summary",
  "/reports/status-distribution",
  "/reports/maintenance-report",
  "/reports/location-inventory",
  "/reports/financial-summary",
  "/reports/employee-assets",
  "/compliance",
  "/requisitions",
  "/requisitions/new",
  "/returns",
  "/returns/new",
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
  "/requisitions/new",
  "/returns",
  "/returns/new",
  "/profile",
];

test.beforeEach(async () => {
  await seedE2E();
});

test.afterAll(async () => {
  await closeSeedConnection();
});

async function expectPageReady(page: Parameters<typeof test>[0]["page"]) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const body = document.body;
        if (!body) return "missing";
        const style = window.getComputedStyle(body);
        return `${style.visibility}:${body.childElementCount}`;
      })
    )
    .toMatch(/^visible:\d+$/);
}

test.describe("Page smoke coverage", () => {
  test("should let an admin open every major top-level page without falling back to login", async ({ page }) => {
    await login(page, "admin@test.com", "AdminPass123!");
    await expectAuthenticatedSession(page);

    for (const path of adminRoutes) {
      await page.goto(path, { waitUntil: "commit" });
      await expect(page).not.toHaveURL(/\/login$/);
      await expectPageReady(page);
    }
  });

  test("should let an employee open employee routes and redirect assignments to my-assets", async ({ page }) => {
    await login(page, "testuser@test.com", "TestPass123!");
    await expectAuthenticatedSession(page);

    for (const path of employeeRoutes) {
      await page.goto(path, { waitUntil: "commit" });
      await expect(page).not.toHaveURL(/\/login$/);
      await expectPageReady(page);
    }

    await page.goto("/assignments", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/my-assets$/);
  });

  test("should redirect back to login when the browser session is cleared after login", async ({ page, context }) => {
    await login(page, "admin@test.com", "AdminPass123!");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("user")))
      .not.toBeNull();
    await expect
      .poll(async () => {
        const cookies = await context.cookies();
        return cookies.some((cookie) => cookie.name === "auth_token");
      })
      .toBe(true);
    await page.goto("/assets", { waitUntil: "commit" });
    await expect(page).not.toHaveURL(/\/login$/);

    await context.clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto("/assets", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login$/);
  });
});
