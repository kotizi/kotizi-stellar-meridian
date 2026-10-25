// Mirrors the contract's storage entries (the Soroban contract in this repo, once it exists).
// Token amounts are in USDC base units (6 decimals) and kept as bigint.

export type Address = string;

/** The app's id of a group: what routes, links and caches use. The group's id in the contract. */
export type GroupId = string;
/** The app's id of a share (membership), like `GroupId`. */
export type MembershipId = string;

export type GroupStatus = "open" | "drawPending" | "completed";

/**
 * Where the draw's randomness comes from: the hash of a ledger committed to in advance
 * (commit-reveal). TODO(vrf): a real VRF would add a source here.
 */
export type DrawSource = "ledgerHash";

export interface Group {
  id: GroupId;
  /** The contract behind the group, shown in the on-chain details. */
  address: Address;
  organizer: Address;
  groupId: bigint;
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
  /** Ledger sequence the pending draw committed to. */
  commitLedger: bigint;
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
  /** Where the share lives on chain (its membership entry). */
  address: Address;
  group: GroupId;
  asset: Address;
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

/** `create_group` arguments (admin only). Amounts in USDC base units; `uri` points at the group's metadata JSON. */
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
