import { describe, expect, test } from "bun:test";

import { formatShares, plural } from "./format";

describe("plural", () => {
  test("adds an s unless the count is one", () => {
    expect(plural(1, "share")).toBe("1 share");
    expect(plural(0, "eligible share")).toBe("0 eligible shares");
  });
});

describe("formatShares", () => {
  test("one, two and more shares read as a sentence", () => {
    expect(formatShares([1])).toBe("share 002");
    expect(formatShares([1, 3])).toBe("shares 002 and 004");
    expect(formatShares([0, 1, 3])).toBe("shares 001, 002 and 004");
    expect(formatShares([0, 1, 2, 3])).toBe("shares 001, 002, 003 and 004");
    expect(formatShares([0, 1, 2, 3, 4, 5])).toBe("shares 001, 002, 003 and 3 more");
    expect(formatShares([])).toBe("no share");
  });
});
