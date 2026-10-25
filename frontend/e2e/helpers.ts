import { expect, type Page } from "@playwright/test";

/** Joins a group by name (mock addresses are random) and pays the first installment with Crypto. */
export async function joinGroup(page: Page, name: string) {
  await page.goto("/groups");
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+$/);

  await page.getByRole("link", { name: "Join this group" }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+\/join$/);

  const rules = page.getByRole("checkbox", { name: /I have read and accept the group rules/ });
  await rules.check();
  await expect(rules).toBeChecked();

  await page.getByRole("button", { name: "Join group" }).click();
  await expect(page.getByRole("heading", { name: `Join ${name}` })).toBeVisible();

  await page.getByRole("button", { name: "Crypto" }).click();
  await expect(page.getByRole("heading", { name: "Crypto" })).toBeVisible();

  await page.getByRole("button", { name: "Confirm and join" }).click();
  await closeStatus(page, "You're in the group");
  await expect(page.getByRole("heading", { name: "You're in the group." })).toBeVisible();
}

/** Runs "Draw now" on /draws; the status dialog says a share was contemplated, whether or not it's the account's. */
export async function drawNow(page: Page) {
  await page.goto("/draws");
  await expect(page.getByRole("heading", { name: "The draw is open" })).toBeVisible();
  await page.getByRole("button", { name: "Draw now" }).click();
  await closeStatus(page, "Share contemplated");
}

/** Waits for the app's status dialog to end on `title` (an action's outcome), then closes it with "Done". */
export async function closeStatus(page: Page, title: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
}
