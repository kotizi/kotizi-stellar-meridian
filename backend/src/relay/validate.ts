import { Address, StrKey, xdr, type Transaction } from '@stellar/stellar-sdk';

export class RelayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The only contract functions the relay sponsors. request_draw / settle_draw go through the keeper. */
export const RELAY_FUNCTIONS = ['join_group', 'pay_quota', 'claim_prize'] as const;
export type RelayFunction = (typeof RELAY_FUNCTIONS)[number];

export type RelayPolicy = {
  /** The account that is the transaction source and pays the fee. */
  sponsor: string;
  /** The Kotizi contract. */
  contractId: string;
  /** The group token (Config.token); the only contract allowed as a sub-invocation, and only `transfer`. */
  token: string;
  /** Stellar wallets of the authenticated user. */
  userWallets: ReadonlySet<string>;
  maxFeeStroops: number;
};

export type RelayCheck = {
  fn: RelayFunction;
  /** Arguments of the call, as the contract receives them. */
  args: xdr.ScVal[];
  func: xdr.HostFunction;
  /** Authorization entries, all for the user's wallets. */
  entries: xdr.SorobanAuthorizationEntry[];
  /** The user wallet whose authorization the call needs. */
  wallet: string;
  /** Fee the sponsor pays at most, in stroops (drives the daily budget). */
  estStroops: number;
};

const same = (a: xdr.ScVal, b: xdr.ScVal) => Buffer.from(a.toXDR()).equals(Buffer.from(b.toXDR()));

function contractFn(f: xdr.SorobanAuthorizedFunction, what: string): xdr.InvokeContractArgs {
  if (f.type !== 'sorobanAuthorizedFunctionTypeContractFn') {
    throw new RelayError('forbidden_authorization', `${what} must be a contract function call`);
  }
  return f.contractFn;
}

const contractIdOf = (a: xdr.ScAddress) => {
  try {
    return Address.fromScAddress(a).toString();
  } catch {
    return '';
  }
};

/**
 * Checks an unsigned, assembled transaction before the sponsor pays for it. The invariants:
 *  - the sponsor is the source and appears nowhere else: no operation-level source, no source-account
 *    credentials (they would let the user make the sponsor authorize anything), no sponsor address in
 *    an authorization entry;
 *  - exactly one operation, an invoke of one of the allowed functions on the Kotizi contract;
 *  - every authorization entry is an address credential of a wallet linked to the authenticated user,
 *    for exactly this call, plus at most one `transfer` on the group token from that wallet to the contract.
 */
export function validateRelayTransaction(tx: Transaction, policy: RelayPolicy): RelayCheck {
  if (tx.source !== policy.sponsor) throw new RelayError('wrong_source', 'The transaction source must be the sponsor');
  if (tx.operations.length !== 1) throw new RelayError('one_operation', 'Exactly one operation is allowed');
  const op = tx.operations[0]!;
  if (op.type !== 'invokeHostFunction') throw new RelayError('forbidden_operation', 'Only contract invocations are allowed');
  if (op.source !== undefined) throw new RelayError('forbidden_operation', 'The operation must not override the source account');
  if (tx.memo.type !== 'none') throw new RelayError('forbidden_memo', 'No memo is allowed');
  const fee = Number(tx.fee);
  if (!Number.isFinite(fee) || fee <= 0 || fee > policy.maxFeeStroops) {
    throw new RelayError('fee_too_high', `The fee exceeds the sponsor limit (${policy.maxFeeStroops} stroops)`);
  }

  const func = op.func;
  if (func.type !== 'hostFunctionTypeInvokeContract') throw new RelayError('forbidden_operation', 'Only contract calls are allowed');
  const call = func.invokeContract;
  if (contractIdOf(call.contractAddress) !== policy.contractId) {
    throw new RelayError('forbidden_contract', 'Only the Kotizi contract can be called');
  }
  const fn = String(call.functionName);
  if (!(RELAY_FUNCTIONS as readonly string[]).includes(fn)) {
    throw new RelayError('forbidden_function', `${fn} is not relayed`);
  }
  const args = call.args;
  checkArgs(fn as RelayFunction, args, policy);

  const entries = op.auth ?? [];
  if (entries.length === 0) throw new RelayError('no_authorization', 'The call carries no authorization');
  let wallet = '';
  for (const entry of entries) {
    const cred = entry.credentials;
    const address =
      cred.type === 'sorobanCredentialsAddress'
        ? cred.address.address
        : cred.type === 'sorobanCredentialsAddressV2'
          ? cred.addressV2.address
          : null;
    if (!address) throw new RelayError('forbidden_authorization', 'Only address credentials are allowed');
    const signer = contractIdOf(address);
    if (!StrKey.isValidEd25519PublicKey(signer) || !policy.userWallets.has(signer)) {
      throw new RelayError('not_user_wallet', 'That authorization is not for one of your wallets', 403);
    }
    if (signer === policy.sponsor) throw new RelayError('forbidden_authorization', 'The sponsor cannot authorize');
    wallet ||= signer;

    const root = contractFn(entry.rootInvocation.function, 'The authorized function');
    if (contractIdOf(root.contractAddress) !== policy.contractId || String(root.functionName) !== fn) {
      throw new RelayError('forbidden_authorization', 'The authorization is for another call');
    }
    if (root.args.length !== args.length || !root.args.every((a, i) => same(a, args[i]!))) {
      throw new RelayError('forbidden_authorization', 'The authorization has other arguments');
    }
    for (const sub of entry.rootInvocation.subInvocations) {
      if (sub.subInvocations.length > 0) throw new RelayError('forbidden_authorization', 'Nested sub-invocations are not allowed');
      const s = contractFn(sub.function, 'A sub-invocation');
      const [from, to] = s.args.map((a) => (a.type === 'scvAddress' ? contractIdOf(a.address) : ''));
      const ok =
        fn === 'pay_quota' &&
        contractIdOf(s.contractAddress) === policy.token &&
        String(s.functionName) === 'transfer' &&
        s.args.length === 3 &&
        from === signer &&
        to === policy.contractId;
      if (!ok) throw new RelayError('forbidden_authorization', 'Only the quota transfer to the contract is allowed as a sub-call');
    }
  }
  return { fn: fn as RelayFunction, args, func, entries, wallet, estStroops: fee };
}

function checkArgs(fn: RelayFunction, args: xdr.ScVal[], policy: RelayPolicy) {
  const bad = () => new RelayError('bad_arguments', `Unexpected arguments for ${fn}`);
  const isU32 = (a: xdr.ScVal | undefined) => a?.type === 'scvU32';
  if (fn === 'join_group') {
    if (args.length !== 2 || !isU32(args[0]) || args[1]!.type !== 'scvAddress') throw bad();
    const member = contractIdOf(args[1]!.address);
    if (!policy.userWallets.has(member)) throw new RelayError('not_user_wallet', 'You can only join with your own wallet', 403);
    return;
  }
  if (args.length !== 2 || !isU32(args[0]) || !isU32(args[1])) throw bad();
}
