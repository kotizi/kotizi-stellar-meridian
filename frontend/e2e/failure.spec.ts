import { test, expect } from "@playwright/test";

import { closeStatus, openAccountMenu, openJoin, openJoinCheckout } from "./helpers";

const GROUP = "Porto Novo Lofts";

// The mock's "Fail next confirmation" helper makes the next transaction fail like a real one would.
// It lives in the page's memory, so it's set on the join screen itself: a reload would drop it.
test("a failed checkout says why and joins on 'Try again'", async ({ page }) => {
  await openJoin(page, GROUP);
  await openAccountMenu(page);
  // A submenu: it opens on hover or with the right arrow, not on click.
  await page.getByRole("menuitem", { name: "Fail next confirmation" }).press("ArrowRight");
  await page.getByRole("menuitem", { name: "Network error" }).click();

  await openJoinCheckout(page, GROUP);
  await page.getByRole("button", { name: "Confirm and join" }).click();

  // The checkout's deposit is the first transaction, so it's the one that fails.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Payment not completed" })).toBeVisible();
  await expect(dialog).toContainText("Couldn't reach the network. Check your connection and try again");

  // The failure was one-off: trying again deposits, then joins.
  await dialog.getByRole("button", { name: "Try again" }).click();
  await closeStatus(page, "You're in the group");
  await expect(page.getByRole("heading", { name: "You're in the group." })).toBeVisible();
});
