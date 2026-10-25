import { test, expect } from "@playwright/test";

import { joinGroup } from "./helpers";

// Bots pay but never join, so Porto Novo Lofts always has a spot.
test("make a payment to join a group", async ({ page }) => {
  await joinGroup(page, "Porto Novo Lofts");

  await page.getByRole("link", { name: "Go to home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("You don't have a share yet")).toBeHidden();
});
