import { describe, expect, test } from "bun:test";

import { KotiziError } from "../errors";
import { toAppUnits, toTokenUnits } from "./units";

const usd = (n: number) => BigInt(n) * 1_000_000n;

describe("token decimals and the app's unit", () => {
  test("a 6-decimal token is already in the app's unit", () => {
    expect(toAppUnits(usd(100), 6)).toBe(usd(100));
    expect(toTokenUnits(usd(100), 6)).toBe(usd(100));
  });

  test("a 7-decimal token (USDC) shifts by one digit", () => {
    expect(toAppUnits(1_000_000_000n, 7)).toBe(usd(100));
    expect(toTokenUnits(usd(100), 7)).toBe(1_000_000_000n);
  });

  test("extra digits are dropped only on the way to the screen", () => {
    // 0.1234567 USDC shows as 0.123456.
    expect(toAppUnits(1_234_567n, 7)).toBe(123_456n);
  });

  test("a token with fewer decimals than the app refuses a fraction it can't hold", () => {
    expect(toAppUnits(100n, 2)).toBe(usd(1));
    expect(toTokenUnits(usd(1), 2)).toBe(100n);
    expect(() => toTokenUnits(1n, 2)).toThrow(KotiziError);
  });
});
