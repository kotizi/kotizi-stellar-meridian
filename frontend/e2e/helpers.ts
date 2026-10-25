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
  await expect(page.getByRole("heading", { name: "You're in the group." })).toBeVisible();
}

/** Runs "Draw now" on /draws; the toast shows whether or not the account wins. */
export async function drawNow(page: Page) {
  await page.goto("/draws");
  await expect(page.getByRole("heading", { name: "The draw is open" })).toBeVisible();
  await page.getByRole("button", { name: "Draw now" }).click();
  await expect(page.getByText("Share contemplated")).toBeVisible({ timeout: 15_000 });
}
