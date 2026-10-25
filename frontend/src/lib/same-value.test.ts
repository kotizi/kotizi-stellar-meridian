import { describe, expect, test } from "bun:test";

import { sameValue } from "./same-value";

describe("sameValue", () => {
  test("equal plain data, however deep", () => {
    const group = () => ({ name: "Casa", quota: 100n, prizes: [0n, 5n], owner: null, meta: { location: "SP" } });
    expect(sameValue(group(), group())).toBe(true);
    expect(sameValue([1, "a", 2n], [1, "a", 2n])).toBe(true);
    expect(sameValue(null, null)).toBe(true);
  });

  test("any difference counts", () => {
    expect(sameValue({ quota: 100n }, { quota: 101n })).toBe(false);
    expect(sameValue([0n, 5n], [0n, 5n, 0n])).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue({ a: undefined }, { b: undefined })).toBe(false);
    expect(sameValue([1], { 0: 1 })).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue(1n, 1)).toBe(false);
  });
});
