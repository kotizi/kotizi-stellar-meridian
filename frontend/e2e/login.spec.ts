import { test, expect } from "@playwright/test";

// Starts signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test("signing in sends a new account to identity verification", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL(/\/verify/);
});
