import { expect, type Page } from "@playwright/test";

/** Opens a group's join screen by name (mock addresses are random) and accepts its rules. */
export async function openJoin(page: Page, name: string) {
  await page.goto("/groups");
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+$/);

  await page.getByRole("link", { name: "Join this group" }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+\/join$/);

  const rules = page.getByRole("checkbox", { name: /I have read and accept the group rules/ });
  await rules.check();
  await expect(rules).toBeChecked();
}

/** From the join screen, opens the checkout with Crypto picked, ready for "Confirm and join". */
export async function openJoinCheckout(page: Page, name: string) {
  await page.getByRole("button", { name: "Join group" }).click();
  await expect(page.getByRole("heading", { name: `Join ${name}` })).toBeVisible();

  await page.getByRole("button", { name: "Crypto" }).click();
  await expect(page.getByRole("heading", { name: "Crypto" })).toBeVisible();
}

/** Joins a group by name and pays the first installment with Crypto. */
export async function joinGroup(page: Page, name: string) {
  await openJoin(page, name);
  await openJoinCheckout(page, name);
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

/**
 * Creates a group from the admin screen (the mock lets every account) with the first property, a
 * 1-minute period and `shares` shares, and lands on its page. Names are unique per call, so tests
 * can find their own group by name.
 */
export async function createGroup(page: Page, { shares = 2 }: { shares?: number } = {}) {
  const name = `E2E ${Date.now().toString(36)}`;
  await page.goto("/admin/groups/new");
  await page.getByLabel("Group name").fill(name);
  await page.getByLabel(/^Shares/).fill(String(shares));
  await page.getByRole("button", { name: "Create group" }).click();

  const confirm = page.getByRole("dialog");
  await expect(confirm.getByRole("heading", { name: `Create ${name}?` })).toBeVisible();
  await confirm.getByRole("button", { name: "Confirm and create" }).click();
  await closeStatus(page, "Group created");
  // The group page's eyebrow names the group (its title is the plan, "2-installment group").
  await expect(page.getByText(`Group · ${name}`)).toBeVisible();
  return name;
}

/** Opens the account menu (the sidebar's "Account" button on desktop). */
export async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: "Account" }).click();
}

/** Waits for the app's status dialog to end on `title` (an action's outcome), then closes it with "Done". */
export async function closeStatus(page: Page, title: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
}
