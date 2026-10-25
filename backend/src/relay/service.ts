import { Address, TransactionBuilder, Transaction, authorizeEntry, xdr } from '@stellar/stellar-sdk';
import { schema } from '../db/index.js';
import type { Deps } from '../deps.js';
import { HttpError } from '../routes/common.js';
import { invokeFunc, u32, addr } from '../stellar/invoke.js';
import { StellarTxError } from '../stellar/errors.js';
import { withAccountLock } from '../stellar/lock.js';
import { assertBudget } from './budget.js';
import { RelayError, groupIdOf, validateRelayTransaction, type RelayCheck, type RelayFunction } from './validate.js';

export type PrepareRequest = { fn: RelayFunction; groupId: number; index?: number; wallet: string };
export type Prepared = {
  /** The assembled, unsigned transaction (base64 XDR). Send it back untouched with the signatures. */
  transaction: string;
  /** The ledger the authorization signatures are valid until. */
  validUntilLedger: number;
  /** What the wallet signs: one 32-byte payload (hex) per authorization entry, in order. */
  payloads: { address: string; payload: string }[];
};

/** The policy for a call on `groupId`: the only token sub-call allowed is a transfer of that group's token. */
async function policyFor(deps: Deps, userWallets: string[], groupId: number | undefined) {
  // no group id: nothing is allowed through (the validator names the reason), so no token is needed
  const group = groupId === undefined ? undefined : await deps.chain.group(groupId);
  if (groupId !== undefined && !group) throw new HttpError(422, 'contract_error', 'GroupNotFound');
  const token = group?.token ?? '';
  return {
    sponsor: deps.sponsor.publicKey(),
    contractId: deps.chain.contractId,
    token,
    userWallets: new Set(userWallets),
    maxFeeStroops: deps.config.RELAY_MAX_FEE_STROOPS,
  };
}

/** Maps a failed simulation/transaction to the answer the frontend expects (422 + the contract error name). */
function asHttp(e: unknown): never {
  if (e instanceof StellarTxError) {
    throw new HttpError(422, e.contractError ? 'contract_error' : 'transaction_failed', e.contractError ?? e.message);
  }
  throw e;
}

/**
 * Step 1 of a gasless call: builds and simulates the transaction with the sponsor as source, checks
 * it, and returns what the user's wallet must sign (the authorization payloads). Nothing is sent.
 */
export async function prepareRelay(deps: Deps, user: { userId: string; wallets: string[] }, req: PrepareRequest): Promise<Prepared> {
  const { chain } = deps;
  if (!(await chain.accountExists(req.wallet))) {
    throw new HttpError(409, 'account_not_active', 'The wallet has no Stellar account yet: call POST /v1/kyc first');
  }
  const args =
    req.fn === 'join_group' ? [u32(req.groupId), addr(req.wallet)] : [u32(req.groupId), u32(req.index ?? 0)];
  let prepared;
  try {
    prepared = await chain.invokeTx(deps.sponsor.publicKey(), invokeFunc(chain.contractId, req.fn, args));
  } catch (e) {
    asHttp(e);
  }
  const check = validateRelayTransaction(prepared.transaction, await policyFor(deps, user.wallets, req.groupId));
  const validUntilLedger = (await chain.ledger()) + deps.config.RELAY_AUTH_LEDGERS;

  const payloads: Prepared['payloads'] = [];
  for (const entry of check.entries) {
    const address = addressOf(entry);
    let payload = '';
    // authorizeEntry hands the payload to the callback; we only want that, not a signature.
    await authorizeEntry(
      entry,
      async (_pre, p) => {
        payload = Buffer.from(p).toString('hex');
        throw new CapturedPayload();
      },
      validUntilLedger,
      deps.config.NETWORK_PASSPHRASE,
    ).catch((e) => {
      if (!(e instanceof CapturedPayload)) throw e;
    });
    payloads.push({ address, payload });
  }
  return { transaction: prepared.transaction.toXDR(), validUntilLedger, payloads };
}

class CapturedPayload extends Error {}

function addressOf(entry: xdr.SorobanAuthorizationEntry): string {
  const c = entry.credentials;
  const a = c.type === 'sorobanCredentialsAddress' ? c.address.address : c.type === 'sorobanCredentialsAddressV2' ? c.addressV2.address : null;
  if (!a) throw new RelayError('forbidden_authorization', 'Only address credentials are allowed');
  return validateAddress(a);
}

const validateAddress = (a: xdr.ScAddress) => Address.fromScAddress(a).toString();

/**
 * Step 2: takes the transaction from step 1 and the wallet's signatures, re-validates everything (the
 * client could have changed the XDR), signs the authorization entries, simulates in enforcing mode
 * with a fresh sequence number, and sends it with the sponsor's signature.
 */
export async function relay(
  deps: Deps,
  user: { userId: string; wallets: string[] },
  req: { transaction: string; validUntilLedger: number; signatures: string[] },
): Promise<{ txHash: string; kinds: string[] }> {
  const { chain, config } = deps;
  let parsed;
  try {
    parsed = TransactionBuilder.fromXDR(req.transaction, config.NETWORK_PASSPHRASE);
  } catch {
    throw new RelayError('bad_transaction', 'Not a valid transaction');
  }
  if (!(parsed instanceof Transaction)) throw new RelayError('bad_transaction', 'Fee-bump envelopes are not accepted');
  const policy = await policyFor(deps, user.wallets, groupIdOf(parsed));
  const check = validateRelayTransaction(parsed, policy);

  const ledger = await chain.ledger();
  if (req.validUntilLedger <= ledger) throw new RelayError('authorization_expired', 'The authorization expired: prepare again', 409);
  if (req.validUntilLedger > ledger + config.RELAY_AUTH_LEDGERS + 5) {
    throw new RelayError('bad_expiry', 'The authorization is valid for too long');
  }
  if (req.signatures.length !== check.entries.length) throw new RelayError('bad_signatures', 'One signature per authorization entry');

  const signed: xdr.SorobanAuthorizationEntry[] = [];
  for (const [i, entry] of check.entries.entries()) {
    const hex = req.signatures[i]!;
    if (!/^[0-9a-fA-F]{128}$/.test(hex)) throw new RelayError('bad_signatures', 'A signature is 64 bytes of hex');
    try {
      signed.push(
        await authorizeEntry(
          entry,
          async () => ({ signature: Buffer.from(hex, 'hex'), publicKey: addressOf(entry) }),
          req.validUntilLedger,
          config.NETWORK_PASSPHRASE,
        ),
      );
    } catch {
      throw new RelayError('bad_signatures', 'A signature does not match its authorization');
    }
  }

  return withAccountLock(deps.sponsor.publicKey(), async () => {
    let prepared;
    try {
      prepared = await chain.invokeTx(deps.sponsor.publicKey(), check.func, signed);
      // the same checks on what will actually be paid for (fee after the fresh simulation)
      validateRelayTransaction(prepared.transaction, policy);
      await assertBudget(deps, user.userId, prepared.estFeeStroops);
      prepared.transaction.sign(deps.sponsor);
      const txHash = await chain.send(prepared.transaction);
      await deps.db.insert(schema.sponsoredTx).values({
        userId: user.userId,
        wallet: check.wallet,
        txHash,
        kinds: check.fn,
        estStroops: prepared.estFeeStroops,
      });
      return { txHash, kinds: [check.fn] };
    } catch (e) {
      return asHttp(e);
    }
  });
}

export type { RelayCheck };
