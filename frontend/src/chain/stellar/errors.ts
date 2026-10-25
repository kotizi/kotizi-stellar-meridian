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
  // The wallet has no ledger account: `POST /v1/kyc` (identity verification) creates it.
  if (e.code === "account_not_active") return "KycRequired";
  // The signed authorization outlived its ledger: prepare and sign again.
  if (e.code === "authorization_expired") return "TransactionExpired";
  // An authorization for a wallet that isn't the user's: the share belongs to another account.
  if (e.code === "not_user_wallet") return "NotAssetOwner";
  return null;
}
