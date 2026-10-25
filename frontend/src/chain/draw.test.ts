import { describe, expect, test } from "bun:test";

import type { KotiziClient } from "./client";
import { drawUntilSettled } from "./draw";
import type { DrawStep, Group } from "./types";

/** A client whose `drawNow` answers with `steps` in order; `getGroup` returns `group` (none by default). */
function clientWith(...steps: DrawStep[]) {
  return clientFor(null, ...steps);
}

function clientFor(group: Group | null, ...steps: DrawStep[]) {
  let calls = 0;
  const client = {
    getGroup: async () => group,
    drawNow: async () => steps[Math.min(calls++, steps.length - 1)],
  } as unknown as KotiziClient;
  return { client, calls: () => calls };
}

/** A due group with `paid` of its 10 shares paid this period. */
const dueGroup = (paid: number, status: Group["status"] = "open") =>
  ({
    status,
    nextDrawTs: 0,
    membersJoined: 10,
    paidBitmap: (1n << BigInt(paid)) - 1n,
    wonBitmap: 0n,
  }) as Group;

const fast = { delayMs: 0 };

describe("drawUntilSettled", () => {
  test("requests, waits for the randomness, then settles", async () => {
    const { client, calls } = clientWith(
      { action: "request", signature: "req" },
      { action: null, reason: "waitingForRandomness" },
      { action: "settle", signature: "settle" },
    );
    expect(await drawUntilSettled(client, "g", fast)).toEqual({ settled: true, signature: "settle" });
    expect(calls()).toBe(3);
  });

  test("a draw settled by someone else (the keeper) counts as drawn", async () => {
    const { client } = clientWith({ action: "request", signature: "req" }, { action: null, reason: "notDue" });
    expect(await drawUntilSettled(client, "g", fast)).toEqual({ settled: true, signature: null });
  });

  test("reports why there is nothing to do", async () => {
    const { client, calls } = clientWith({ action: null, reason: "noEligibleShares" });
    expect(await drawUntilSettled(client, "g", fast)).toEqual({ settled: false, requested: false, reason: "noEligibleShares" });
    expect(calls()).toBe(1);
  });

  test("gives up after the attempts, keeping the request", async () => {
    const { client, calls } = clientWith(
      { action: "request", signature: "req" },
      { action: null, reason: "waitingForRandomness" },
    );
    expect(await drawUntilSettled(client, "g", { ...fast, attempts: 3 })).toEqual({ settled: false, requested: true });
    expect(calls()).toBe(4);
  });

  test("doesn't start a draw below the installment threshold", async () => {
    const { client, calls } = clientFor(dueGroup(7), { action: "request", signature: "req" });
    expect(await drawUntilSettled(client, "g", fast)).toEqual({ settled: false, requested: false, reason: "belowThreshold" });
    expect(calls()).toBe(0);
  });

  test("starts it once the threshold is met, and always reveals a pending draw", async () => {
    const met = clientFor(dueGroup(8), { action: "settle", signature: "s" });
    expect(await drawUntilSettled(met.client, "g", fast)).toEqual({ settled: true, signature: "s" });
    const pending = clientFor(dueGroup(1, "drawPending"), { action: "settle", signature: "s" });
    expect(await drawUntilSettled(pending.client, "g", fast)).toEqual({ settled: true, signature: "s" });
  });
});
