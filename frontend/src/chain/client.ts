import type { TxFailureCode } from "./errors";
import type {
  Address,
  CreateGroupInput,
  DrawStep,
  Group,
  GroupId,
  GroupMetadata,
  KycRecord,
  Membership,
  MembershipId,
  TxResult,
} from "./types";

/**
 * Everything the UI needs from the chain. Components talk to this interface only, so the mock
 * can be swapped for the Stellar client generated from the deployed contract.
 */
export interface KotiziClient {
  readonly kind: "mock" | "stellar";

  listGroups(): Promise<Group[]>;
  getGroup(id: GroupId): Promise<Group | null>;
  getGroupMetadata(group: Group): Promise<GroupMetadata | null>;
  listGroupMemberships(group: GroupId): Promise<Membership[]>;
  /** The owner's shares, each with its group. */
  listSharesByOwner(owner: Address): Promise<{ membership: Membership; group: Group }[]>;
  getKyc(wallet: Address): Promise<KycRecord | null>;
  getUsdcBalance(wallet: Address): Promise<bigint>;
  /**
   * Whether this is a test network (testnet, the mock), where test balance and the other
   * test helpers may show. Mainnet answers false; UI code asks through `useTestHelpers()`.
   */
  isTestNetwork(): Promise<boolean>;
  /** Whether `wallet` is the contract's admin, the only account that creates groups. */
  isAdmin(wallet: Address): Promise<boolean>;

  /**
   * `join_group`, optionally followed by `pay_quota` for the new share in the same transaction
   * (the contract keeps them as two calls).
   */
  joinGroup(args: { owner: Address; group: GroupId; payFirstQuota?: boolean }): Promise<TxResult & { membership: MembershipId }>;
  payQuota(args: { owner: Address; membership: MembershipId }): Promise<TxResult>;
  /**
   * "Draw now": runs the group's next draw step, `request_draw` (fixes a future drand round) or
   * `settle_draw` (the contract verifies that round's beacon and picks the winner), or says why there
   * is none yet. Both steps are permissionless and sponsored; a keeper also runs them on its own, so
   * nobody has to click.
   */
  drawNow(args: { group: GroupId }): Promise<DrawStep>;
  /** Pays the share's prize (won in any round) to the NFT owner, minus the admin fee. */
  claimPrize(args: { owner: Address; membership: MembershipId }): Promise<TxResult>;
  /**
   * Identity verification (KYC), demo only: approves the wallet's identity record (KYC attestation,
   * signed by the KYC authority). No personal data is sent; there is no real provider yet. An
   * identity approved earlier resolves without a new transaction (empty signature).
   */
  verifyIdentity(wallet: Address): Promise<TxResult>;
  /**
   * `create_group`, signed by the admin. Not sponsored: the admin pays the fee and the storage rent.
   */
  createGroup(input: CreateGroupInput): Promise<TxResult & { group: GroupId }>;

  /** Test-only helpers (mock and testnet): a test USDC faucet and the mock's failure simulation. */
  readonly testing?: {
    /** Adds test USDC to `wallet` (the backend faucet mints its own fixed amount, whatever `amount` says). */
    fundUsdc(wallet: Address, amount: bigint): Promise<TxResult>;
    /**
     * The checkout's deposit: adds what `owner`'s wallet lacks to pay `amount`. Resolves with the
     * deposit, or null when the wallet already covers it.
     */
    depositShortfall?(args: { owner: Address; amount: bigint }): Promise<TxResult | null>;
    /** Mock only: drops all local state and reseeds. */
    reset?(): Promise<void>;
    /** Mock only: the next transaction fails with this wallet/network error (to demo error states). */
    failNextTransaction?(code: TxFailureCode): void;
    /** Mock only: while on, every read and transaction fails with `NetworkError`. */
    setOffline?(offline: boolean): void;
    isOffline?(): boolean;
  };
}
