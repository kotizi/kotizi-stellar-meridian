import { z } from "zod";

import { bitmapOf, MAX_SHARES } from "./derive";
import type { DrawIdleReason, DrawStep, Group } from "./types";

// What the backend's routes answer for a group and a draw, and its conversion
// to the app's types. Bigints travel as strings; bitmaps as lists of share indexes.

/** A non-negative integer the backend sends as a string (bigints, timestamps). */
export const numericString = z.string().regex(/^\d+$/);

/** The fields of a group view (`GET /v1/groups/:id`). */
export const groupStateViewSchema = z.object({
  name: z.string(),
  uri: z.string(),
  quotaAmount: numericString,
  maxMembers: z.number(),
  membersJoined: z.number(),
  periodSecs: numericString,
  adminFeeBps: z.number(),
  round: z.number(),
  nextDrawTs: numericString,
  status: z.enum(["Open", "DrawPending", "Completed"]),
  lastWinnerIndex: z.number(),
  winners: z.array(z.object({ index: z.number(), round: z.number(), prize: numericString, claimed: z.boolean() })),
  unclaimedIndexes: z.array(z.number()),
  unclaimedTotal: numericString,
  paidIndexes: z.array(z.number()),
  wonIndexes: z.array(z.number()),
});

type GroupStateView = z.infer<typeof groupStateViewSchema>;

type GroupState = Omit<Group, "id" | "address" | "organizer" | "groupId" | "mint" | "drawSource" | "drawRound">;

const STATUS = { Open: "open", DrawPending: "drawPending", Completed: "completed" } as const;

/** The group's terms, round and per-share prize ledger; the client adds where the group lives. */
export function toGroupState(view: GroupStateView): GroupState {
  const prizes = Array<bigint>(MAX_SHARES).fill(0n);
  const wonRound = Array<number>(MAX_SHARES).fill(0);
  for (const winner of view.winners) {
    prizes[winner.index] = BigInt(winner.prize);
    wonRound[winner.index] = winner.round;
  }
  return {
    name: view.name,
    quotaAmount: BigInt(view.quotaAmount),
    maxMembers: view.maxMembers,
    membersJoined: view.membersJoined,
    periodSecs: Number(view.periodSecs),
    adminFeeBps: view.adminFeeBps,
    uri: view.uri,
    round: view.round,
    nextDrawTs: Number(view.nextDrawTs),
    paidBitmap: bitmapOf(view.paidIndexes),
    wonBitmap: bitmapOf(view.wonIndexes),
    status: STATUS[view.status],
    lastWinnerIndex: view.lastWinnerIndex,
    prizes,
    wonRound,
    unclaimedBitmap: bitmapOf(view.unclaimedIndexes),
    unclaimedTotal: BigInt(view.unclaimedTotal),
  };
}

const IDLE_REASONS: Record<string, DrawIdleReason> = {
  not_due: "notDue",
  no_eligible_cotas: "noEligibleShares",
  waiting_for_randomness: "waitingForRandomness",
  completed: "completed",
};

/** "Draw now"'s answer: the step it ran (`tx` = its signature or hash), or the keeper's reason for none. */
export function toDrawStep(action: "request" | "settle" | null, tx: string | null, reason: string | null): DrawStep {
  if (action && tx) return { action, signature: tx };
  // A reason this version doesn't know means the draw can't move yet: ask again later.
  return { action: null, reason: IDLE_REASONS[reason ?? ""] ?? "waitingForRandomness" };
}
