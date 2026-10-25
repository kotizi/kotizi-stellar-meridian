import { describe, expect, test } from "bun:test";

import { beaconUrl, DRAW_ROUND_DELAY, QUICKNET_GENESIS, QUICKNET_PERIOD, roundAfter, roundTime } from "./drand";

describe("drand quicknet clock", () => {
  test("round 1 is published at genesis, then one round every period", () => {
    expect(roundTime(1)).toBe(QUICKNET_GENESIS);
    expect(roundTime(2)).toBe(QUICKNET_GENESIS + QUICKNET_PERIOD);
  });

  test("a requested draw waits for a round that doesn't exist yet", () => {
    const now = QUICKNET_GENESIS + 1_000_000;
    const round = roundAfter(now, DRAW_ROUND_DELAY);
    expect(roundTime(round)).toBeGreaterThan(now);
    expect(roundTime(round) - now).toBeLessThanOrEqual(DRAW_ROUND_DELAY * QUICKNET_PERIOD);
  });

  test("matches the contract's round_after: (now - genesis) / period + 1 + delay", () => {
    // 7 seconds past genesis: round 3 is running (published at +6), so a 10-round delay gives 13.
    expect(roundAfter(QUICKNET_GENESIS + 7, 10)).toBe(13);
  });

  test("links a round to drand's public beacon", () => {
    expect(beaconUrl(42)).toMatch(/^https:\/\/api\.drand\.sh\/52db9ba7[0-9a-f]+\/public\/42$/);
  });
});
