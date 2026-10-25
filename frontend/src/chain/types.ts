// Mirrors the Kotizi contract's storage (`contract/kotizi/src/types.rs`).
//
// Amounts are the app's unit, kept as bigint: USD with 6 decimals (1 USD = 1_000_000), whatever
// the group's token. Each group's token has its own decimals on chain (6 or 7 today); the chain
// client converts at its boundary, so screens, rules and the mock never see a token's decimals.

export type Address = string;

/** The app's id of a group: what routes, links and caches use (`ids.ts`: the contract's group number). */
export type GroupId = string;
/** The app's id of a share (membership): its group and index (`ids.ts`). */
export type MembershipId = string;

export type GroupStatus = "open" | "drawPending" | "completed";

/**
 * Where the draw's randomness comes from: a drand quicknet beacon the contract verifies itself
 * (`drand.ts`), or the mock's own random pick.
 */
export type DrawSource = "drand" | "mock";

export interface Group {
  id: GroupId;
  /** The contract behind the group, shown in the on-chain details. */
  address: Address;
  organizer: Address;
  /** The group's number in the contract (`group_id`, from 0). */
  groupId: number;
  /** The token the group collects and pays prizes in. */
  mint: Address;
  name: string;
  quotaAmount: bigint;
  maxMembers: number;
  membersJoined: number;
  periodSecs: number;
  adminFeeBps: number;
  uri: string;
  round: number;
  nextDrawTs: number;
  paidBitmap: bigint;
  wonBitmap: bigint;
  status: GroupStatus;
  drawSource: DrawSource;
  /** The drand round that decides the pending draw; 0 when none is pending. */
  drawRound: bigint;
  /** Winner of the most recent draw (informational). */
  lastWinnerIndex: number;
  /**
   * Gross prize each share won, by share index (0 until it wins; kept after the claim). An unclaimed
   * prize waits here and never blocks a later draw.
   */
  prizes: bigint[];
  /** Round in which each share won, by share index. */
  wonRound: number[];
  /** Bit i set = share i won and has not claimed yet. */
  unclaimedBitmap: bigint;
  /** Sum of the prizes still unclaimed; the vault always holds at least this much. */
  unclaimedTotal: bigint;
}

/** Off-chain JSON behind `Group.uri`, shared by every membership NFT of the group. */
export interface GroupMetadata {
  description: string;
  location: string;
  propertyValue: bigint;
}

export interface Membership {
  id: MembershipId;
  /** The contract that holds the share (it mints the membership NFT itself). */
  address: Address;
  group: GroupId;
  /** The membership NFT's token id in that contract (`ids.ts`, `nftTokenId`). */
  asset: string;
  index: number;
  /** Everything this share has paid. Null if the contract doesn't keep it, so the app doesn't number the installments. */
  totalPaid: bigint | null;
  /** Current owner of the membership NFT; the owner controls the share. */
  owner: Address;
}

export interface KycRecord {
  wallet: Address;
  approvedAt: number;
}

export interface TxResult {
  signature: string;
}

/** `create_group` arguments (admin only). Amounts in the app's unit (USD, 6 decimals); `uri` points at the group's metadata JSON. */
export interface CreateGroupInput {
  organizer: Address;
  name: string;
  quotaAmount: bigint;
  maxMembers: number;
  periodSecs: number;
  adminFeeBps: number;
  uri: string;
}

/** Why "draw now" did nothing. `belowThreshold` is the app's own rule (`drawUntilSettled`), not the keeper's. */
export type DrawIdleReason = "notDue" | "noEligibleShares" | "waitingForRandomness" | "completed" | "belowThreshold";

/** Outcome of "draw now": the draw step that ran (`request_draw` or `settle_draw`), or why none could. */
export type DrawStep =
  | ({ action: "request" | "settle" } & TxResult)
  | { action: null; reason: DrawIdleReason };
