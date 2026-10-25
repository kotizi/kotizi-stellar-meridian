import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("sign in and verify identity", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL(/\/verify/);

  // The date field is type="date", so it takes YYYY-MM-DD.
  await page.getByLabel("Full name").fill("John Doe");
  await page.getByLabel("CPF").fill("11111111111");
  await page.getByLabel("Date of birth").fill("2001-01-01");
  await page.getByRole("button", { name: "Verify identity" }).click();

  // Save the state only once the identity record exists (the mock keeps it in localStorage).
  await expect(page.getByRole("heading", { name: "Your identity is verified" })).toBeVisible();
  await page.context().storageState({ path: authFile });
});
