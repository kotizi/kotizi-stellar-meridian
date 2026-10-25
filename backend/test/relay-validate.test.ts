import { Account, Address, Memo, Operation, StrKey, TransactionBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { RelayError, validateRelayTransaction, type RelayPolicy } from '../src/relay/validate.js';
import { addr, invokeFunc, u32 } from '../src/stellar/invoke.js';
import { CONTRACT, PASSPHRASE, TOKEN, TOKEN_7, newKey } from './fake-chain.js';

const sponsor = newKey().publicKey();
const user = newKey().publicKey();
const stranger = newKey().publicKey();
const policy: RelayPolicy = { sponsor, contractId: CONTRACT, token: TOKEN, userWallets: new Set([user]), maxFeeStroops: 1_000_000 };

const fnCall = (contract: string, fn: string, args: xdr.ScVal[]) =>
  new xdr.InvokeContractArgs({ contractAddress: new Address(contract).toScAddress(), functionName: fn, args });

const invocation = (call: xdr.InvokeContractArgs, subs: xdr.SorobanAuthorizedInvocation[] = []) =>
  new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
    subInvocations: subs,
  });

const transferSub = (from: string, to: string, contract = TOKEN, fn = 'transfer') =>
  invocation(fnCall(contract, fn, [addr(from), addr(to), nativeToScVal(100n, { type: 'i128' })]));

const entry = (who: string, root: xdr.SorobanAuthorizedInvocation) =>
  new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({ address: new Address(who).toScAddress(), nonce: 1n, signatureExpirationLedger: 0, signature: xdr.ScVal.scvVoid() }),
    ),
    rootInvocation: root,
  });

type Over = Partial<{
  source: string;
  opSource: string;
  contract: string;
  fn: string;
  args: xdr.ScVal[];
  auth: xdr.SorobanAuthorizationEntry[];
  fee: string;
  memo: Memo;
  twoOps: boolean;
}>;

function build(o: Over = {}) {
  const fn = o.fn ?? 'pay_quota';
  const args = o.args ?? [u32(0), u32(1)];
  const contract = o.contract ?? CONTRACT;
  const call = fnCall(contract, fn, args);
  const auth = o.auth ?? [entry(user, invocation(call, fn === 'pay_quota' ? [transferSub(user, CONTRACT)] : []))];
  const b = new TransactionBuilder(new Account(o.source ?? sponsor, '1'), { fee: o.fee ?? '100000', networkPassphrase: PASSPHRASE, memo: o.memo });
  const op = () => Operation.invokeHostFunction({ func: invokeFunc(contract, fn, args), auth, source: o.opSource });
  b.addOperation(op());
  if (o.twoOps) b.addOperation(op());
  return b.setTimeout(60).build();
}

const reject = (code: string, o: Over) => {
  try {
    validateRelayTransaction(build(o), policy);
  } catch (e) {
    expect(e).toBeInstanceOf(RelayError);
    expect((e as RelayError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe('relay validation: what is accepted', () => {
  it('a pay_quota with the quota transfer', () => {
    const check = validateRelayTransaction(build(), policy);
    expect(check.fn).toBe('pay_quota');
    expect(check.wallet).toBe(user);
    expect(check.estStroops).toBe(100_000);
  });
  it('a join_group for the user, claim_prize without sub-calls', () => {
    const join = [u32(0), addr(user)];
    expect(validateRelayTransaction(build({ fn: 'join_group', args: join }), policy).fn).toBe('join_group');
    expect(validateRelayTransaction(build({ fn: 'claim_prize' }), policy).fn).toBe('claim_prize');
  });
});

describe('relay validation: the sponsor can never be used as an authority or a spender', () => {
  it('rejects another source account, an operation-level source, several operations', () => {
    reject('wrong_source', { source: stranger });
    reject('forbidden_operation', { opSource: sponsor });
    reject('one_operation', { twoOps: true });
  });
  it('rejects source-account credentials (they would authorize as the sponsor)', () => {
    const call = fnCall(CONTRACT, 'claim_prize', [u32(0), u32(1)]);
    const sourceCreds = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: invocation(call),
    });
    reject('forbidden_authorization', { fn: 'claim_prize', auth: [sourceCreds] });
  });
  it('rejects an authorization entry for the sponsor or for a wallet that is not the user’s', () => {
    const call = fnCall(CONTRACT, 'claim_prize', [u32(0), u32(1)]);
    reject('not_user_wallet', { fn: 'claim_prize', auth: [entry(sponsor, invocation(call))] });
    reject('not_user_wallet', { fn: 'claim_prize', auth: [entry(stranger, invocation(call))] });
  });
  it('rejects the sponsor as an authorizer even if it were listed among the user’s wallets (defence in depth)', () => {
    const call = fnCall(CONTRACT, 'claim_prize', [u32(0), u32(1)]);
    const tx = build({ fn: 'claim_prize', auth: [entry(sponsor, invocation(call))] });
    const lax: RelayPolicy = { ...policy, userWallets: new Set([user, sponsor]) };
    expect(() => validateRelayTransaction(tx, lax)).toThrow(/sponsor cannot authorize/);
  });
  it('rejects joining with somebody else’s wallet', () => {
    reject('not_user_wallet', { fn: 'join_group', args: [u32(0), addr(stranger)] });
  });
  it('rejects a contract address as the authorizing wallet', () => {
    const call = fnCall(CONTRACT, 'claim_prize', [u32(0), u32(1)]);
    reject('not_user_wallet', { fn: 'claim_prize', auth: [entry(StrKey.encodeContract(Buffer.alloc(32, 1)), invocation(call))] });
  });
});

describe('relay validation: only the sponsored calls', () => {
  it('rejects other contracts and functions', () => {
    reject('forbidden_contract', { contract: TOKEN, fn: 'mint', args: [addr(user), nativeToScVal(1n, { type: 'i128' })] });
    for (const fn of ['approve_kyc', 'create_group', 'request_draw', 'settle_draw', 'transfer', 'upgrade']) {
      reject('forbidden_function', { fn, args: [u32(0)] });
    }
  });
  it('rejects malformed arguments', () => {
    reject('bad_arguments', { fn: 'pay_quota', args: [u32(0)] });
    reject('bad_arguments', { fn: 'pay_quota', args: [u32(0), nativeToScVal(1n, { type: 'i128' })] });
    reject('bad_arguments', { fn: 'join_group', args: [u32(0), u32(1)] });
  });
  it('rejects calls with no authorization, or authorization for another call', () => {
    reject('no_authorization', { auth: [] });
    const other = fnCall(CONTRACT, 'pay_quota', [u32(0), u32(2)]);
    reject('forbidden_authorization', { auth: [entry(user, invocation(other, [transferSub(user, CONTRACT)]))] });
    const otherFn = fnCall(CONTRACT, 'claim_prize', [u32(0), u32(1)]);
    reject('forbidden_authorization', { auth: [entry(user, invocation(otherFn))] });
  });
});

describe('relay validation: sub-invocations', () => {
  const call = fnCall(CONTRACT, 'pay_quota', [u32(0), u32(1)]);
  const withSubs = (subs: xdr.SorobanAuthorizedInvocation[]) => ({ auth: [entry(user, invocation(call, subs))] });

  it('allows only the quota transfer on the group token, from the signer to the contract', () => {
    reject('forbidden_authorization', withSubs([transferSub(user, stranger)])); // to somebody else
    reject('forbidden_authorization', withSubs([transferSub(stranger, CONTRACT)])); // from somebody else
    reject('forbidden_authorization', withSubs([transferSub(user, CONTRACT, StrKey.encodeContract(Buffer.alloc(32, 3)))])); // other token
    reject('forbidden_authorization', withSubs([transferSub(user, CONTRACT, TOKEN, 'burn')])); // other function
  });
  it('follows the group’s token: a group in another token only allows that token’s transfer', () => {
    const seven: RelayPolicy = { ...policy, token: TOKEN_7 };
    const ok = (subs: xdr.SorobanAuthorizedInvocation[]) => validateRelayTransaction(build({ auth: [entry(user, invocation(call, subs))] }), seven);
    expect(() => ok([transferSub(user, CONTRACT, TOKEN_7)])).not.toThrow();
    expect(() => ok([transferSub(user, CONTRACT, TOKEN)])).toThrow(RelayError); // the default token is now the wrong one
  });
  it('rejects nested sub-calls and sub-calls on functions that take no payment', () => {
    const nested = invocation(fnCall(TOKEN, 'transfer', [addr(user), addr(CONTRACT), nativeToScVal(1n, { type: 'i128' })]), [transferSub(user, CONTRACT)]);
    reject('forbidden_authorization', withSubs([nested]));
    const claim = fnCall(CONTRACT, 'claim_prize', [u32(0), u32(1)]);
    reject('forbidden_authorization', { fn: 'claim_prize', auth: [entry(user, invocation(claim, [transferSub(user, CONTRACT)]))] });
  });
});

describe('relay validation: cost and decoration', () => {
  it('rejects a fee above the limit and a memo', () => {
    reject('fee_too_high', { fee: '2000000' });
    reject('forbidden_memo', { memo: Memo.text('hi') });
  });
});
