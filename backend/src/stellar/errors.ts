/** Contract error codes (contract/kotizi/src/errors.rs). Keep in sync. */
export const CONTRACT_ERRORS: Record<number, string> = {
  1: 'InvalidTokenDecimals',
  2: 'AlreadyApproved',
  3: 'NotKyc',
  4: 'GroupNotFound',
  5: 'InvalidQuota',
  6: 'InvalidMaxMembers',
  7: 'InvalidPeriod',
  8: 'FeeTooHigh',
  9: 'NameTooLong',
  10: 'UriTooLong',
  11: 'GroupFull',
  12: 'GroupNotOpen',
  13: 'CotaNotFound',
  14: 'AlreadyPaid',
  15: 'UnsupportedToken',
  16: 'TooManyGroups',
  17: 'MathOverflow',
  18: 'DrawNotDue',
  19: 'NoEligibleMembers',
  20: 'DrawNotExpired',
  21: 'NoDrawPending',
  22: 'DrawTooEarly',
  23: 'InvalidBeacon',
  24: 'InsufficientVault',
  25: 'NotWinner',
  26: 'AlreadyClaimed',
};

/** A failed simulation or transaction, with the contract error name when the message carries one. */
export class StellarTxError extends Error {
  readonly contractError: string | undefined;
  constructor(message: string, readonly detail?: string[]) {
    super(message);
    const m = /Error\(Contract, #(\d+)\)/.exec(`${message} ${(detail ?? []).join(' ')}`);
    this.contractError = m ? CONTRACT_ERRORS[Number(m[1])] : undefined;
  }
}

/**
 * A Stellar Asset Contract (USDC, USDT0...) fails with "trustline entry is missing for account" when asked
 * the balance of, or to move tokens from, an account that has no trustline to the asset.
 */
export function isMissingTrustline(e: unknown): boolean {
  return e instanceof StellarTxError && /trustline entry is missing/i.test(e.message);
}

/** A balance read where "no trustline" simply means the account holds none of the token. */
export async function zeroIfNoTrustline(read: () => Promise<bigint>): Promise<bigint> {
  try {
    return await read();
  } catch (e) {
    if (isMissingTrustline(e)) return 0n;
    throw e;
  }
}
