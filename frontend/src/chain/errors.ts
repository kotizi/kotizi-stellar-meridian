import type { BackendError } from "./api";

// Error codes the UI can hit: the program's errors (programs/kotizi/src/errors.rs, subset), checks
// the program gets from other programs or Anchor (identity record missing, token balance), and
// failures of the transaction itself (wallet, network). Network fees and rent are sponsored (the
// backend relay pays them), so "not enough SOL" only reaches the admin, who pays to create a group.
const PROGRAM_MESSAGES = {
  Unauthorized: "Only the kotizi admin can create groups",
  InvalidQuota: "The installment must be greater than zero",
  InvalidMaxMembers: "A group has between 2 and 64 shares",
  InvalidPeriod: "The period between draws must be greater than zero",
  FeeTooHigh: "The admin fee can be 10% at most",
  NameTooLong: "The group name is too long",
  UriTooLong: "The group's content link is too long",
  GroupFull: "Group is full",
  GroupNotOpen: "Group is not open for this action",
  AlreadyPaid: "Installment already paid for this draw",
  DrawNotDue: "Draw is not due yet",
  NoEligibleMembers: "No eligible share paid this installment",
  DrawNotExpired: "A draw is already pending and has not expired",
  NoDrawPending: "No draw is pending",
  DrawTooEarly: "The draw is not ready yet, try again in a moment",
  SlotHashUnavailable: "This draw expired. Start it again",
  RandomnessNotFulfilled: "The random number isn't ready yet, try again in a moment",
  NotWinner: "This share hasn't been contemplated yet",
  AlreadyClaimed: "This share's credit was already released",
  NotAssetOwner: "This share belongs to another account",
  KycRequired: "Identity verification required",
  InsufficientFunds: "Insufficient balance to pay the installment",
  /** The checkout's deposit on test networks (the backend faucet): one per wallet per day. */
  FaucetLimit: "Deposits are limited to one a day",
  /** Demo identity verification (backend) is turned off (`KYC_MODE=off`). */
  IdentityVerificationUnavailable: "Identity verification is unavailable right now",
  AccountNotFound: "Account not found",
  /** The paying account (the admin, on create_group) can't cover the network fee and rent. */
  NotEnoughXlm: "The admin account doesn't have enough to pay the network fee",
} as const;

const TX_FAILURE_MESSAGES = {
  UserRejected: "Confirmation cancelled",
  TransactionExpired: "The confirmation took too long. Please try again",
  NetworkError: "Couldn't reach the network. Check your connection and try again",
  SessionExpired: "Your session expired. Log in again",
  /** The backend can't sponsor the transaction right now (daily limit, budget or its own balance). */
  SponsorUnavailable: "kotizi is busy right now. Please try again later",
  /** The backend or the Stellar RPC failed or is rate-limited (5xx, 429): nothing the user did. */
  ServiceUnavailable: "kotizi can't complete this right now. Please try again in a moment",
  /** A chain failure with no specific copy; details stay in the error's `cause`. */
  TransactionFailed: "The transaction failed. Please try again",
} as const;

const MESSAGES = { ...PROGRAM_MESSAGES, ...TX_FAILURE_MESSAGES };

export type KotiziErrorCode = keyof typeof MESSAGES;
/** Failures that come from the wallet or the network rather than from the program's rules. */
export type TxFailureCode = keyof typeof TX_FAILURE_MESSAGES;

export const isKotiziErrorCode = (code: string): code is KotiziErrorCode => Object.hasOwn(MESSAGES, code);

export const TX_FAILURE_CODES = Object.keys(TX_FAILURE_MESSAGES) as TxFailureCode[];

export class KotiziError extends Error {
  constructor(
    public readonly code: KotiziErrorCode,
    options?: { cause?: unknown },
  ) {
    super(MESSAGES[code], options);
    this.name = "KotiziError";
  }
}

// --- shared by the network clients -------------------------------------------------------------

/**
 * A backend answer (Solana and EVM routes) as a KotiziError. `special` maps the network's own
 * codes first (contract or program errors, expired requests); it returns null for the rest.
 */
export function fromBackendError(
  e: BackendError,
  cause: unknown,
  special: (e: BackendError) => KotiziErrorCode | null = () => null,
): KotiziError {
  const code = special(e);
  if (code) return new KotiziError(code, { cause });
  if (e.status === 401) return new KotiziError("SessionExpired", { cause });
  if (e.code === "faucet_limit") return new KotiziError("FaucetLimit", { cause });
  if (e.code === "kyc_unavailable") return new KotiziError("IdentityVerificationUnavailable", { cause });
  // user_limit (429), sponsor_budget and sponsor_funds (503)
  if (e.status === 429 || e.code.startsWith("sponsor_")) return new KotiziError("SponsorUnavailable", { cause });
  // The backend or its RPC failed (e.g. a rate-limited one); also answers reads, so not "transaction".
  if (e.status >= 500) return new KotiziError("ServiceUnavailable", { cause });
  return new KotiziError("TransactionFailed", { cause });
}

const USER_REJECTED = /reject|denied|cancel|declined|closed the modal|user (exited|closed)/i;

/** A wallet prompt the user dismissed, in the wallet's own words (Privy, wallet-standard, EIP-1193 4001). */
export function isUserRejected(e: unknown) {
  const { code, message } = (e ?? {}) as { code?: unknown; message?: unknown };
  return code === 4001 || (typeof message === "string" && USER_REJECTED.test(message));
}

/** `fetch` couldn't reach the server. */
export function isFetchFailure(e: unknown) {
  return e instanceof TypeError && /fetch|network/i.test(e.message);
}
