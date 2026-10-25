import { KotiziError } from "../errors";

// Each group's token has its own decimals on chain (6 for the demo token, 7 for USDC); the app's
// amounts are always USD with 6 decimals (`types.ts`). These convert at the client's boundary.

/** Decimals of the app's amounts (1 USD = 1_000_000). */
export const APP_DECIMALS = 6;

/**
 * A token amount in the app's unit. A token with more decimals loses its extra digits (rounded
 * down): only what a screen shows comes this way, never what is sent on chain.
 */
export function toAppUnits(amount: bigint, decimals: number): bigint {
  if (decimals === APP_DECIMALS) return amount;
  return decimals > APP_DECIMALS
    ? amount / 10n ** BigInt(decimals - APP_DECIMALS)
    : amount * 10n ** BigInt(APP_DECIMALS - decimals);
}

/**
 * An app amount in the token's base units, for what is sent on chain (a group's quota). Exact or
 * refused: a token with fewer decimals than the app can't hold a fraction it would have to drop.
 */
export function toTokenUnits(amount: bigint, decimals: number): bigint {
  if (decimals >= APP_DECIMALS) return amount * 10n ** BigInt(decimals - APP_DECIMALS);
  const step = 10n ** BigInt(APP_DECIMALS - decimals);
  if (amount % step !== 0n) throw new KotiziError("InvalidQuota");
  return amount / step;
}
