import { sleep } from "@/lib/sleep";

import type { KotiziClient } from "./client";
import { drawPhase } from "./derive";
import type { DrawIdleReason, GroupId } from "./types";

export type DrawOutcome =
  /** A winner was drawn. `signature` is the settle transaction when this session sent it. */
  | { settled: true; signature: string | null }
  /** The draw was requested but the randomness wasn't ready in time; it settles later (keeper or retry). */
  | { settled: false; requested: true }
  /** Nothing to do yet. */
  | { settled: false; requested: false; reason: DrawIdleReason };


/**
 * One click of "Draw now": runs the next draw step and, after a request, keeps asking until the
 * randomness is revealed. When another caller (the keeper) settles it first, the next step comes
 * back idle for a new reason, which also means the winner is out. A new draw only starts once the
 * app's installment threshold is met (`drawPhase`); a pending one is always revealed.
 */
export async function drawUntilSettled(
  client: KotiziClient,
  group: GroupId,
  { attempts = 10, delayMs = 1_500 }: { attempts?: number; delayMs?: number } = {},
): Promise<DrawOutcome> {
  const current = await client.getGroup(group);
  if (current && drawPhase(current, Math.floor(Date.now() / 1000)) === "belowThreshold") {
    return { settled: false, requested: false, reason: "belowThreshold" };
  }
  let requested = false;
  for (let i = 0; i <= attempts; i++) {
    const step = await client.drawNow({ group });
    if (step.action === "settle") return { settled: true, signature: step.signature };
    if (step.action === null) {
      if (step.reason !== "waitingForRandomness") {
        return requested ? { settled: true, signature: null } : { settled: false, requested: false, reason: step.reason };
      }
    } else requested = true;
    if (i < attempts) await sleep(delayMs);
  }
  return requested ? { settled: false, requested: true } : { settled: false, requested: false, reason: "waitingForRandomness" };
}
