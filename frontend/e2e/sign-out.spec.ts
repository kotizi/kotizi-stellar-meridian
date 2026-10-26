import { test, expect } from "@playwright/test";

test("signing out goes to the landing page and closes the app's screens", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();

  // The sidebar's own "Sign out" button (the account menu has one too).
  await page.getByRole("complementary").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Sign in with email" })).toBeVisible();

  // Signed out, a screen of the app sends the visitor back to the landing page.
  await page.goto("/payments");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Sign in with email" })).toBeVisible();
});
