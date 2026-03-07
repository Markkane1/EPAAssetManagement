import { expect, type Page } from "@playwright/test";

export async function solveCaptcha(page: Page) {
  const challengeText = (await page.locator("text=/Solve:/").first().locator("..").textContent()) || "";
  const normalized = challengeText.replace(/\s+/g, " ").trim();
  const match = normalized.match(/(\d+)\s*([+\-×xX])\s*(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse captcha challenge from: ${normalized}`);
  }

  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);

  let answer = 0;
  if (operator === "+") answer = left + right;
  else if (operator === "-") answer = left - right;
  else answer = left * right;

  await page.getByPlaceholder("?").fill(String(answer));
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await solveCaptcha(page);
  await page.getByRole("button", { name: /sign in/i }).click();
}

export async function expectProtectedRedirect(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login$/);
}
