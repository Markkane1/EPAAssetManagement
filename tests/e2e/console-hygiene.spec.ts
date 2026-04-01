import { expect, test } from "@playwright/test";

import { closeSeedConnection, seedE2E } from "./seed";
import { login } from "./helpers";

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
  "/categories",
  "/vendors",
  "/projects",
  "/reports",
  "/reports/asset-summary",
  "/reports/asset-items-inventory",
  "/reports/assignment-summary",
  "/reports/status-distribution",
  "/reports/maintenance-report",
  "/reports/location-inventory",
  "/reports/financial-summary",
  "/reports/employee-assets",
  "/requisitions",
  "/requisitions/new",
  "/returns",
  "/returns/new",
  "/settings",
  "/audit-logs",
  "/user-management",
  "/profile",
];

const employeeRoutes = ["/", "/my-assets", "/requisitions", "/requisitions/new", "/returns", "/returns/new", "/profile"];

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
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/login$/);
      await expectPageReady(page);
    }

    expect(errors).toEqual([]);
  });

  test("should avoid console and page errors across employee pages", async ({ page }) => {
    const errors: string[] = [];

    await login(page, "testuser@test.com", "TestPass123!");
    attachConsoleCollectors(page, errors);
    await expect(page).toHaveURL("/");

    for (const path of employeeRoutes) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/login$/);
      await expectPageReady(page);
    }

    expect(errors).toEqual([]);
  });
});
