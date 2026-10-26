import { test, expect } from "@playwright/test";

import { createGroup } from "./helpers";

// The mock lets every account create groups, so the signed-in account is the admin here.
test("the admin opens group creation from the groups page", async ({ page }) => {
  await page.goto("/groups");
  await page.getByRole("link", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/admin\/groups\/new/);
  await expect(page.getByRole("heading", { name: "Create a group" })).toBeVisible();
});

test("the admin creates a group and it opens for members", async ({ page }) => {
  const name = await createGroup(page, { shares: 4 });
  await expect(page).toHaveURL(/\/groups\/[^/]+$/);

  // The new group is in the open groups list, with every share still open.
  await page.goto("/groups");
  const card = page.getByRole("link", { name });
  await expect(card).toBeVisible();
  await expect(card).toContainText("0/4");
});
