import { BackendError } from "../api";
import { fromBackendError, isFetchFailure, isUserRejected, KotiziError, type KotiziErrorCode } from "../errors";

/**
 * The contract's errors (contract/kotizi/src/errors.rs) the UI has words for. The backend answers a
 * failed simulation or transaction as `422 { code: "contract_error", message: "<ErrorName>" }`, and a
 * failed "draw now" step as `422 { code: "draw_failed", message: "<ErrorName>" }`.
 */
export const CONTRACT_ERRORS: Record<string, KotiziErrorCode> = {
  NotKyc: "KycRequired",
  GroupNotFound: "AccountNotFound",
  InvalidQuota: "InvalidQuota",
  InvalidMaxMembers: "InvalidMaxMembers",
  InvalidPeriod: "InvalidPeriod",
  FeeTooHigh: "FeeTooHigh",
  NameTooLong: "NameTooLong",
  UriTooLong: "UriTooLong",
  GroupFull: "GroupFull",
  GroupNotOpen: "GroupNotOpen",
  CotaNotFound: "AccountNotFound",
  AlreadyPaid: "AlreadyPaid",
  DrawNotDue: "DrawNotDue",
  NoEligibleMembers: "NoEligibleMembers",
  DrawNotExpired: "DrawNotExpired",
  NoDrawPending: "NoDrawPending",
  DrawTooEarly: "DrawTooEarly",
  InvalidBeacon: "InvalidBeacon",
  InsufficientVault: "InsufficientVault",
  NotWinner: "NotWinner",
  AlreadyClaimed: "AlreadyClaimed",
  TokenNotSupported: "TokenNotSupported",
};

/**
 * The contract's errors no screen can reach, so they stay a plain "transaction failed": admin setup
 * (`add_token`), checks the backend's KYC already avoids, and internal guards.
 */
export const UNMAPPED_CONTRACT_ERRORS = [
  "InvalidTokenDecimals",
  "AlreadyApproved",
  "UnsupportedToken",
  "TooManyGroups",
  "MathOverflow",
  "TokenAlreadyAdded",
  "TooManyTokens",
] as const;

/**
 * The contract's error numbers (`#[repr(u32)]` in errors.rs). A transaction the app sends itself (the
 * admin's `create_group`) fails on the RPC with the bare `Error(Contract, #N)`; the backend's answers
 * already carry the name.
 */
export const CONTRACT_ERROR_CODES: Record<number, string> = {
  1: "InvalidTokenDecimals",
  2: "AlreadyApproved",
  3: "NotKyc",
  4: "GroupNotFound",
  5: "InvalidQuota",
  6: "InvalidMaxMembers",
  7: "InvalidPeriod",
  8: "FeeTooHigh",
  9: "NameTooLong",
  10: "UriTooLong",
  11: "GroupFull",
  12: "GroupNotOpen",
  13: "CotaNotFound",
  14: "AlreadyPaid",
  15: "UnsupportedToken",
  16: "TooManyGroups",
  17: "MathOverflow",
  18: "DrawNotDue",
  19: "NoEligibleMembers",
  20: "DrawNotExpired",
  21: "NoDrawPending",
  22: "DrawTooEarly",
  23: "InvalidBeacon",
  24: "InsufficientVault",
  25: "NotWinner",
  26: "AlreadyClaimed",
  27: "TokenNotSupported",
  28: "TokenAlreadyAdded",
  29: "TooManyTokens",
};

/**
 * The app's code for a raw host error from the RPC (`Error(Contract, #N)` in a failed simulation or
 * transaction), or null when it names no contract error the UI has words for.
 */
export function contractErrorFromHost(message: string): KotiziErrorCode | null {
  const code = /Error\(Contract, #(\d+)\)/.exec(message)?.[1];
  const name = code === undefined ? undefined : CONTRACT_ERROR_CODES[Number(code)];
  return name ? (CONTRACT_ERRORS[name] ?? null) : null;
}

/**
 * OpenZeppelin's fungible token (the demo test token) can't cover a transfer:
 * `FungibleTokenError::InsufficientBalance`. Its code isn't the Kotizi contract's, so the backend
 * passes the raw host error through as `transaction_failed`.
 */
const TOKEN_INSUFFICIENT_BALANCE = /Error\(Contract, #100\)/;

/**
 * Maps an error from the Stellar path (backend reads, the relay, the wallet's signature) to a
 * KotiziError when it is one the UI knows; anything else is returned unchanged.
 */
export function toStellarError(error: unknown): unknown {
  if (error instanceof KotiziError) return error;
  if (error instanceof BackendError) return fromBackendError(error, error, stellarBackendCode);
  if (isUserRejected(error)) return new KotiziError("UserRejected", { cause: error });
  if (isFetchFailure(error)) return new KotiziError("NetworkError", { cause: error });
  return error;
}

function stellarBackendCode(e: BackendError): KotiziErrorCode | null {
  if (e.code === "contract_error" || e.code === "draw_failed") return CONTRACT_ERRORS[e.message] ?? null;
  if (e.code === "transaction_failed" && TOKEN_INSUFFICIENT_BALANCE.test(e.message)) return "InsufficientFunds";
  // A Stellar asset (USDC…) the wallet holds no trustline for: it can't pay or receive in that token.
  if (e.code === "missing_trustline") return "TrustlineRequired";
  // The wallet has no ledger account: `POST /v1/kyc` (identity verification) creates it.
  if (e.code === "account_not_active") return "KycRequired";
  // The signed authorization outlived its ledger: prepare and sign again.
  if (e.code === "authorization_expired") return "TransactionExpired";
  // An authorization for a wallet that isn't the user's: the share belongs to another account.
  if (e.code === "not_user_wallet") return "NotAssetOwner";
  return null;
}
