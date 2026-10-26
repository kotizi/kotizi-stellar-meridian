import { describe, expect, test } from "bun:test";

import {
  formatDateMono,
  formatDuration,
  formatNextDraw,
  formatPeriod,
  formatShare,
  formatShares,
  formatUsdc,
  plural,
  shortAddress,
  usdc,
} from "./format";

describe("formatUsdc", () => {
  test("base units (6 decimals) as dollars and cents, with thousands separators", () => {
    expect(formatUsdc(0n)).toBe("0.00");
    expect(formatUsdc(1n)).toBe("0.00");
    expect(formatUsdc(10_000n)).toBe("0.01");
    expect(formatUsdc(1_500_000n)).toBe("1.50");
    expect(formatUsdc(1_250_000_000n)).toBe("1,250.00");
    expect(formatUsdc(72_000_000_000n)).toBe("72,000.00");
    expect(formatUsdc(1_234_567_890_120_000n)).toBe("1,234,567,890.12");
  });

  test("cuts the extra digits instead of rounding: never shows more than there is", () => {
    expect(formatUsdc(1_999_999n)).toBe("1.99");
    expect(formatUsdc(1_999_999n, { decimals: 0 })).toBe("1");
  });

  test("whole dollars, or more digits, on request", () => {
    expect(formatUsdc(72_000_000_000n, { decimals: 0 })).toBe("72,000");
    expect(formatUsdc(1_234_567n, { decimals: 6 })).toBe("1.234567");
    expect(formatUsdc(1_000_000n, { decimals: 4 })).toBe("1.0000");
  });

  test("a negative amount keeps its sign, below one dollar too", () => {
    expect(formatUsdc(-500_000n)).toBe("-0.50");
    expect(formatUsdc(-1_250_000_000n)).toBe("-1,250.00");
  });
});

describe("usdc", () => {
  test("dollars to base units, rounded to the nearest unit", () => {
    expect(usdc(0)).toBe(0n);
    expect(usdc(1.5)).toBe(1_500_000n);
    expect(usdc(72_000)).toBe(72_000_000_000n);
    // 0.1 + 0.2 is 0.30000000000000004 in floating point: still 0.30 USD.
    expect(usdc(0.1 + 0.2)).toBe(300_000n);
    expect(usdc(0.0000004)).toBe(0n);
  });

  test("round-trips with formatUsdc", () => {
    expect(formatUsdc(usdc(14_400))).toBe("14,400.00");
    expect(formatUsdc(usdc(0.01))).toBe("0.01");
  });
});

describe("shortAddress", () => {
  test("keeps both ends", () => {
    expect(shortAddress("GBQLWJABCDEFGHIJKLMNOPQRS6R6")).toBe("GBQL…S6R6");
    expect(shortAddress("CAT65NQ3OYCX6EOAZRNU5JM6IMXQ5I6KJMNJRDIOF5WQKOYVNJ43MD5G", 6)).toBe("CAT65N…43MD5G");
  });
});

describe("formatDuration", () => {
  test("the two largest units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(65)).toBe("1m 05s");
    expect(formatDuration(3_600)).toBe("1h 0m");
    expect(formatDuration(3_725)).toBe("1h 2m");
    expect(formatDuration(90_000)).toBe("1d 1h");
  });

  test("drops fractions and never goes negative (a past deadline)", () => {
    expect(formatDuration(59.9)).toBe("59s");
    expect(formatDuration(-30)).toBe("0s");
  });
});

describe("formatPeriod", () => {
  test("the form's periods", () => {
    expect(formatPeriod(60)).toBe("every 1 min");
    expect(formatPeriod(300)).toBe("every 5 min");
    expect(formatPeriod(86_400)).toBe("daily");
    expect(formatPeriod(2_592_000)).toBe("monthly");
  });

  test("other periods in their largest whole unit", () => {
    expect(formatPeriod(30)).toBe("every 30 s");
    expect(formatPeriod(90)).toBe("every 90 s");
    expect(formatPeriod(7_200)).toBe("every 2 h");
    expect(formatPeriod(604_800)).toBe("every 7 days");
    expect(formatPeriod(7_776_000)).toBe("every 3 months");
  });
});

describe("formatShare", () => {
  test("numbers shares from 001, always three digits", () => {
    expect(formatShare(0)).toBe("001");
    expect(formatShare(40)).toBe("041");
    expect(formatShare(63)).toBe("064");
  });
});

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

// Built from the local clock, like the app: these pass in any time zone.
const local = (...args: [number, number, number, number, number]) => new Date(...args).getTime() / 1000;

describe("formatDateMono", () => {
  test("month, day and 24-hour time in the browser's time zone", () => {
    expect(formatDateMono(local(2026, 10, 15, 20, 0))).toBe("NOV 15 · 20:00");
    expect(formatDateMono(local(2026, 0, 3, 7, 5))).toBe("JAN 3 · 07:05");
  });
});

describe("formatNextDraw", () => {
  const at = local(2026, 9, 26, 12, 0);

  test("the date while the draw is ahead", () => {
    expect(formatNextDraw(at, at - 1)).toBe("OCT 26 · 12:00");
  });

  test("'Due now' from its time on", () => {
    expect(formatNextDraw(at, at)).toBe("Due now");
    expect(formatNextDraw(at, at + 3_600)).toBe("Due now");
  });

  test("the date during prerender (no clock yet)", () => {
    expect(formatNextDraw(at, 0)).toBe("OCT 26 · 12:00");
  });
});
