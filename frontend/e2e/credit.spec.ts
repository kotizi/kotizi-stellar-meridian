import { test, expect } from "@playwright/test";

import { closeStatus, createGroup, joinGroup } from "./helpers";

// To win for sure, the account is alone in a group it creates (the mock's members never join new
// groups): its share is the only one eligible. The page's clock is moved past the 1-minute period
// instead of waiting for it.
test("the contemplated share sees its credit reserved for the property", async ({ page }) => {
  await page.clock.install();
  const name = await createGroup(page, { shares: 2 });
  await joinGroup(page, name);

  await page.goto("/draws");
  await page.clock.fastForward("01:05");
  await expect(page.getByRole("heading", { name: "The draw is open" })).toBeVisible();
  await page.getByRole("button", { name: "Draw now" }).click();
  await closeStatus(page, "Share contemplated");

  await page.getByRole("link", { name: "See my credit" }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+\/credit$/);
  await expect(page.getByText("Credit reserved · share 001")).toBeVisible();

  // Only this share paid draw 1 (72,000 ÷ 2 = 36,000), minus the 2% admin fee.
  const value = (label: string) => page.getByRole("term").filter({ hasText: label }).locator("xpath=following-sibling::dd[1]");
  await expect(value("Credit value")).toHaveText("72,000.00 USD");
  await expect(value("Collected in draw 1")).toHaveText("36,000.00 USD");
  await expect(value("Admin fee · 2%")).toHaveText("−720.00 USD");
  await expect(value("Credit for the property")).toHaveText("35,280.00 USD");
  await expect(page.getByText("Installments continue")).toBeVisible();
});
