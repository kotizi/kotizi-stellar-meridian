import { sleep } from "@/lib/sleep";

import type { KotiziClient } from "./client";
import { drawPhase } from "./derive";
import { DRAW_ROUND_DELAY, QUICKNET_PERIOD } from "./drand";
import type { DrawIdleReason, GroupId } from "./types";

const DRAW_DELAY_MS = 1_500;
/**
 * How long one click waits for the winner: the drand round is `DRAW_ROUND_DELAY` rounds (30 s) after
 * the request, and the backend settles a few seconds after it's published. 45 s, then the keeper
 * finishes on its own and the screen shows the winner once it reads it.
 */
const DRAW_ATTEMPTS = Math.ceil(((DRAW_ROUND_DELAY * QUICKNET_PERIOD + 15) * 1_000) / DRAW_DELAY_MS);

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
  { attempts = DRAW_ATTEMPTS, delayMs = DRAW_DELAY_MS }: { attempts?: number; delayMs?: number } = {},
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
