import { test, expect } from "@playwright/test";

import { drawNow, joinGroup } from "./helpers";

test("make a share payment", async ({ page }) => {
  await joinGroup(page, "Studio Pinheiros");
  await drawNow(page);

  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: /^Installment 2 of \d+$/ })).toBeVisible();

  await page.getByRole("button", { name: /^Pay .* USD$/ }).click();
  await expect(page.getByRole("heading", { name: "Pay installment 2" })).toBeVisible();

  await page.getByRole("button", { name: "Crypto" }).click();
  await expect(page.getByRole("heading", { name: "Crypto" })).toBeVisible();

  await page.getByRole("button", { name: "Confirm payment" }).click();
  await expect(page.getByText("You're up to date. The next installment opens after this draw.")).toBeVisible();
});
