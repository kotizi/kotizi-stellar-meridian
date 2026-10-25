import { KotiziError } from "./errors";
import type { CreateGroupInput, Group } from "./types";

const BPS_DENOMINATOR = 10_000n;

/** Program accounts hold 64 shares at most (one bit each in the group's bitmaps). */
export const MAX_SHARES = 64;

/** Limits of `create_group` (mirror the contract's constants). */
export const MAX_NAME_BYTES = 32;
export const MAX_URI_BYTES = 200;
export const MAX_FEE_BPS = 1_000;

export const utf8Length = (text: string) => new TextEncoder().encode(text).length;

/** The program's `create_group` checks, in the same order. */
export function assertCreateGroupInput(input: CreateGroupInput) {
  if (utf8Length(input.name) > MAX_NAME_BYTES) throw new KotiziError("NameTooLong");
  if (utf8Length(input.uri) > MAX_URI_BYTES) throw new KotiziError("UriTooLong");
  if (input.quotaAmount <= 0n) throw new KotiziError("InvalidQuota");
  if (input.maxMembers < 2 || input.maxMembers > MAX_SHARES) throw new KotiziError("InvalidMaxMembers");
  if (input.periodSecs <= 0) throw new KotiziError("InvalidPeriod");
  if (input.adminFeeBps > MAX_FEE_BPS) throw new KotiziError("FeeTooHigh");
}

export const bit = (index: number) => 1n << BigInt(index);

export const bitmapOf = (indexes: readonly number[]) => indexes.reduce((bitmap, i) => bitmap | bit(i), 0n);

export function popcount(bitmap: bigint): number {
  let n = 0;
  for (let b = bitmap; b > 0n; b &= b - 1n) n++;
  return n;
}

export const hasPaid = (group: Group, index: number) => (group.paidBitmap & bit(index)) !== 0n;
export const hasWon = (group: Group, index: number) => (group.wonBitmap & bit(index)) !== 0n;

/** Shares that paid this round and haven't won yet (same rule as `settle_draw`). */
export const eligibleBitmap = (group: Group) => group.paidBitmap & ~group.wonBitmap;

/** What the vault holds for this round: paid shares x quota. */
export const currentPool = (group: Group) => group.quotaAmount * BigInt(popcount(group.paidBitmap));

export const adminFee = (pool: bigint, feeBps: number) => (pool * BigInt(feeBps)) / BPS_DENOMINATOR;

/** Net prize the winner receives from `pool` (same split as `claim_prize`). */
export const netPrize = (pool: bigint, feeBps: number) => pool - adminFee(pool, feeBps);

/**
 * Credit value (carta de crédito): what a draw collects once every share of a full group pays, and
 * what each share pays over the whole term. A draw pays less while the group is forming or a share
 * skips an installment.
 */
export const creditValue = (group: Group) => group.quotaAmount * BigInt(group.maxMembers);

/** Admin fee on the credit value, deducted when the credit is released (same split as `claim_prize`). */
export const creditValueFee = (group: Group) => adminFee(creditValue(group), group.adminFeeBps);

/** Prize if every share paid this round: the most a draw pays (less while the group isn't full). */
export const fullRoundPrize = (group: Group) => netPrize(creditValue(group), group.adminFeeBps);

/** True until every share of the group is taken: draws still run, paying only what was collected. */
export const isForming = (group: Group) => group.membersJoined < group.maxMembers;

/** Net credit a draw releases if every share taken so far pays this round. */
export const formingRoundPrize = (group: Group) =>
  netPrize(group.quotaAmount * BigInt(group.membersJoined), group.adminFeeBps);

/** Gross prize this share won (0 until it wins; kept after the claim, like the program's ledger). */
export const grossPrize = (group: Group, index: number) => group.prizes[index] ?? 0n;

/** Net prize this share receives when it claims (same split as `claim_prize`). */
export const prizeOf = (group: Group, index: number) => netPrize(grossPrize(group, index), group.adminFeeBps);

/** True while this share has a prize waiting: it won and hasn't claimed. Any round, never blocks a draw. */
export const isUnclaimed = (group: Group, index: number) => (group.unclaimedBitmap & bit(index)) !== 0n;

/** Draw (1-based) in which this share was contemplated, or null while it hasn't won. */
export const contemplatedInDraw = (group: Group, index: number) =>
  hasWon(group, index) ? (group.wonRound[index] ?? 0) + 1 : null;

/** Quotas this share still owes: one per round left, minus the current one if already paid. */
export function quotasLeft(group: Group, index: number): number {
  if (group.status === "completed") return 0;
  return Math.max(0, group.maxMembers - group.round - (hasPaid(group, index) ? 1 : 0));
}

/** Draw (1-based) the group is collecting for now; the last one once the group has ended. */
export const currentDrawNumber = (group: Group) => Math.min(group.round + 1, group.maxMembers);

/**
 * Share of the taken shares that must pay the period's installment before the app draws (percent).
 * App rule only: the program and the backend keeper don't know it, and `request_draw` stays
 * permissionless, so the keeper may still draw on the due date.
 */
export const DRAW_THRESHOLD_PCT = 80;

/** Installments paid this period, out of the shares taken so far. */
export const paidCount = (group: Group) => popcount(group.paidBitmap);

/** Installments this period needs before the app draws: DRAW_THRESHOLD_PCT of the taken shares, rounded up. */
export const paidRequired = (group: Group) => Math.ceil((group.membersJoined * DRAW_THRESHOLD_PCT) / 100);

/** Installments still missing for the app to draw (0 once the threshold is met). */
export const paidNeeded = (group: Group) => Math.max(0, paidRequired(group) - paidCount(group));

const drawThresholdMet = (group: Group) => paidNeeded(group) === 0;

export type ChainDrawPhase =
  | "waiting" // next draw not due yet
  | "due" // request_draw can be called
  | "noEligible" // due, but nobody eligible paid
  | "pending" // request_draw called, waiting for the randomness and settle_draw
  | "completed";

/** The app's draw phase: the program's, plus "belowThreshold" while too few installments are paid. */
export type DrawPhase = ChainDrawPhase | "belowThreshold";

/** Draw phase by the program's rules: what `request_draw` and `settle_draw` accept. */
export function chainDrawPhase(group: Group, nowSecs: number): ChainDrawPhase {
  if (group.status === "completed") return "completed";
  if (group.status === "drawPending") return "pending";
  if (nowSecs < group.nextDrawTs) return "waiting";
  return eligibleBitmap(group) === 0n ? "noEligible" : "due";
}

/** Phase the UI shows: a due draw waits until DRAW_THRESHOLD_PCT of the taken shares paid. */
export function drawPhase(group: Group, nowSecs: number): DrawPhase {
  const phase = chainDrawPhase(group, nowSecs);
  return phase === "due" && !drawThresholdMet(group) ? "belowThreshold" : phase;
}

/** Shares (indexes) that joined and can still be contemplated but haven't paid this installment. */
export const awaitingInstallment = (group: Group) =>
  Array.from({ length: group.membersJoined }, (_, i) => i).filter((i) => !hasWon(group, i) && !hasPaid(group, i));

/**
 * True when the draw is due but every share that joined has already won: the round waits for a new
 * member to join and pay, since only shares that haven't won can be drawn.
 */
export function waitsForNewMembers(group: Group, nowSecs: number): boolean {
  if (drawPhase(group, nowSecs) !== "noEligible") return false;
  const joined = bit(group.membersJoined) - 1n;
  return (joined & ~group.wonBitmap) === 0n;
}

/** True between a draw and the next one: the last winner is the share to show as "drawn". */
export const lastDrawShown = (group: Group, phase: DrawPhase) =>
  group.round > 0 && (phase === "waiting" || phase === "completed");
