import { test, expect } from "@playwright/test";

// The mock lets every account create groups, so the signed-in account is the admin here.
test("the admin opens group creation from the groups page", async ({ page }) => {
  await page.goto("/groups");
  await page.getByRole("link", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/admin\/groups\/new/);
  await expect(page.getByRole("heading", { name: "Create a group" })).toBeVisible();
});
