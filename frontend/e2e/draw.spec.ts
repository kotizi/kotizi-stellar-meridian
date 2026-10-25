import { test } from "@playwright/test";

import { drawNow, joinGroup } from "./helpers";

// Studio Pinheiros is seeded past its due date with every share paid, so the draw opens at once.
test("join a group and make a draw", async ({ page }) => {
  await joinGroup(page, "Studio Pinheiros");
  await drawNow(page);
});
