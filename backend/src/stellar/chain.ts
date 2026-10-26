import type { Transaction, xdr } from '@stellar/stellar-sdk';

/** Mirrors contract `Status` (u32 repr). */
export const GroupStatus = { Open: 0, DrawPending: 1, Completed: 2 } as const;

/** Mirrors contract `Group`. */
export type RawGroup = {
  id: number;
  name: string;
  uri: string;
  /** The token (SEP-41 contract) the group collects and pays in. */
  token: string;
  quota: bigint;
  period: bigint;
  nextDrawTs: bigint;
  adminFeeBps: number;
  maxMembers: number;
  membersJoined: number;
  round: number;
  status: number;
  paidBitmap: bigint;
  wonBitmap: bigint;
  unclaimedBitmap: bigint;
  unclaimedTotal: bigint;
  vault: bigint;
  lastWinnerIndex: number;
  /** The drand round that decides the pending draw (0n when none is pending). */
  drawRound: bigint;
};

export type RawWinner = { index: number; gross: bigint; wonRound: number };

export type ContractConfig = { admin: string; kycAuthority: string; keeper: string };

/** A token groups can be created in, with its decimals (quotas are in base units). */
export type TokenInfo = { token: string; decimals: number };

/** The chain as the routes and the keeper see it. `RpcChain` is the real one; tests use a fake. */
export interface Chain {
  readonly contractId: string;
  config(): Promise<ContractConfig>;
  /** Tokens enabled for new groups. */
  tokens(): Promise<TokenInfo[]>;
  /** Latest ledger sequence. */
  ledger(): Promise<number>;
  groupCount(): Promise<number>;
  group(id: number): Promise<RawGroup | null>;
  groups(): Promise<RawGroup[]>;
  winners(id: number): Promise<RawWinner[]>;
  cotaOwners(id: number): Promise<string[]>;
  totalPaid(id: number, index: number): Promise<bigint>;
  isKyc(wallet: string): Promise<boolean>;
  /**
   * Balance of `token` and whether the account can hold it. Tokens that are Stellar Asset Contracts (USDC, USDT0)
   * need a trustline: without one the balance is 0 and `trustline` is false. Plain contract tokens never need one.
   */
  tokenHolding(wallet: string, token: string): Promise<{ balance: bigint; trustline: boolean }>;
  accountExists(wallet: string): Promise<boolean>;
  /** XLM balance of an account in stroops (0 when it doesn't exist). */
  xlmBalance(wallet: string): Promise<bigint>;

  /**
   * Builds a one-operation transaction invoking `func` with `source` as the transaction source (fresh
   * sequence number), simulates it and returns it assembled (resources, footprint, auth entries; auth
   * already present in `auth` is kept and simulated in enforcing mode). Archived entries the call needs
   * are restored first, paid by the sponsor. Throws `StellarTxError` on failure.
   */
  invokeTx(source: string, func: xdr.HostFunction, auth?: xdr.SorobanAuthorizationEntry[]): Promise<Prepared>;
  /** Simulates a (signed) transaction in enforcing mode; throws `StellarTxError` when it would fail. */
  simulate(tx: Transaction): Promise<void>;
  /** Sends a signed transaction and waits for it. Resolves with the hash, throws `StellarTxError` on failure. */
  send(tx: Transaction): Promise<string>;
  /** Latest sequence number of an account (the next transaction uses +1). */
  accountSequence(wallet: string): Promise<string>;
  /**
   * Plans an `ExtendFootprintTTL` for what a group needs to keep working: its state, the owner of each cota (the NFT
   * library keeps those only ~30 days), its prizes, and the contract instance and code. `groupId: null` plans the
   * contract instance and code alone. Resolves `null` when every entry still lives at least `whenBelow` ledgers, so a
   * healthy group costs nothing. `source` pays the fee and must sign the returned transaction.
   */
  prepareExtend(source: string, groupId: number | null, opts: { extendTo: number; whenBelow: number }): Promise<ExtendPlan | null>;
  /** Sponsor-paid account creation. */
  createAccount(funder: import('@stellar/stellar-sdk').Keypair, destination: string, startingBalanceXlm: string): Promise<string>;
}

export type Prepared = { transaction: Transaction; estFeeStroops: number };

/** An unsigned transaction that extends the lifetime of the contract entries a group (or the contract) needs. */
export type ExtendPlan = {
  transaction: Transaction;
  estFeeStroops: number;
  /** Entries in the extension. */
  entries: number;
  /** Lifetime, in ledgers, of the entry closest to expiring (before the extension). */
  minRemaining: number;
};
