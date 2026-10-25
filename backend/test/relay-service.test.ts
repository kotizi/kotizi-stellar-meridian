import { Account, Address, Operation, TransactionBuilder, Transaction } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../src/db/index.js';
import { addr, invokeFunc } from '../src/stellar/invoke.js';
import { bearer, callOf, harness, type Harness } from './app-helper.js';
import { PASSPHRASE, TOKEN_7, group, newKey } from './fake-chain.js';

let h: Harness;
const userKp = newKey();
const user = userKp.publicKey();
const other = newKey();

beforeEach(async () => {
  h = await harness();
  h.chain.accounts.add(user);
  h.chain.accounts.add(other.publicKey());
  h.chain.groupList = [group()];
  h.chain.owners.set(0, [user, other.publicKey(), other.publicKey()]);
});
afterEach(() => h.close());

const prepare = (body: object, who = user) => h.app.inject({ method: 'POST', url: '/v1/tx/prepare', headers: bearer(who), payload: body });
const relay = (body: object, who = user) => h.app.inject({ method: 'POST', url: '/v1/tx/relay', headers: bearer(who), payload: body });
const sign = (kp: typeof userKp, payload: string) => Buffer.from(kp.sign(Buffer.from(payload, 'hex'))).toString('hex');

async function prepared(body: object = { fn: 'pay_quota', groupId: 0, index: 0 }) {
  const res = await prepare(body);
  expect(res.statusCode).toBe(200);
  return res.json() as { transaction: string; validUntilLedger: number; payloads: { address: string; payload: string }[] };
}

describe('POST /v1/tx/prepare + /v1/tx/relay', () => {
  it('prepares a payload for the user’s wallet and relays it with the sponsor as source', async () => {
    const p = await prepared();
    expect(p.payloads).toHaveLength(1);
    expect(p.payloads[0]!.address).toBe(user);
    expect(p.payloads[0]!.payload).toMatch(/^[0-9a-f]{64}$/);
    expect(p.validUntilLedger).toBe(1_000 + 120);
    expect(h.chain.sent).toHaveLength(0); // preparing sends nothing

    const res = await relay({ transaction: p.transaction, validUntilLedger: p.validUntilLedger, signatures: [sign(userKp, p.payloads[0]!.payload)] });
    expect(res.statusCode).toBe(200);
    expect(res.json().kinds).toEqual(['pay_quota']);

    const { tx } = h.chain.sent[0]!;
    expect(tx.source).toBe(h.sponsor.publicKey());
    expect(tx.signatures).toHaveLength(1); // the sponsor signed
    const op = tx.operations[0]!;
    expect(op.type === 'invokeHostFunction' && op.auth?.[0]?.credentials.type === 'sorobanCredentialsAddress').toBe(true);
    const creds = op.type === 'invokeHostFunction' ? op.auth![0]!.credentials : undefined;
    expect(creds && creds.type === 'sorobanCredentialsAddress' && creds.address.signatureExpirationLedger).toBe(p.validUntilLedger);
    expect(creds && creds.type === 'sorobanCredentialsAddress' && creds.address.signature.type).toBe('scvVec'); // signed
    const rows = await h.deps.db.select().from(schema.sponsoredTx);
    expect(rows.map((r) => [r.userId, r.wallet, r.kinds])).toEqual([[`dev-${user}`, user, 'pay_quota']]);
  });

  it('pays a group in another token: the signed authorization transfers that group’s token', async () => {
    h.chain.groupList = [group({ id: 1, token: TOKEN_7 })];
    h.chain.owners.set(1, [user]);
    const p = await prepared({ fn: 'pay_quota', groupId: 1, index: 0 });
    const tx = TransactionBuilder.fromXDR(p.transaction, PASSPHRASE) as Transaction;
    const op = tx.operations[0]!;
    const sub = op.type === 'invokeHostFunction' ? op.auth![0]!.rootInvocation.subInvocations[0]! : undefined;
    const f = sub!.function.type === 'sorobanAuthorizedFunctionTypeContractFn' ? sub!.function.contractFn : undefined;
    expect(Address.fromScAddress(f!.contractAddress).toString()).toBe(TOKEN_7);
    const res = await relay({ transaction: p.transaction, validUntilLedger: p.validUntilLedger, signatures: [sign(userKp, p.payloads[0]!.payload)] });
    expect(res.statusCode).toBe(200);
    expect(res.json().kinds).toEqual(['pay_quota']);
  });

  it('join_group needs no token sub-call and uses the caller’s wallet', async () => {
    const p = await prepared({ fn: 'join_group', groupId: 0 });
    const res = await relay({ transaction: p.transaction, validUntilLedger: p.validUntilLedger, signatures: [sign(userKp, p.payloads[0]!.payload)] });
    expect(res.statusCode).toBe(200);
    expect(callOf(h.chain.sent[0]!.tx).fn).toBe('join_group');
  });

  it('refuses to prepare for a wallet that is not the user’s, or a cota owned by someone else', async () => {
    expect((await prepare({ fn: 'join_group', groupId: 0, wallet: other.publicKey() })).statusCode).toBe(403);
    const res = await prepare({ fn: 'pay_quota', groupId: 0, index: 1 }); // owned by `other`
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('not_user_wallet');
    expect((await prepare({ fn: 'approve_kyc', groupId: 0 })).statusCode).toBe(400);
    expect((await prepare({ fn: 'pay_quota', groupId: 0 })).statusCode).toBe(400);
  });

  it('asks for activation when the wallet has no account yet', async () => {
    h.chain.accounts.delete(user);
    const res = await prepare({ fn: 'join_group', groupId: 0 });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('account_not_active');
  });

  it('turns a failed simulation into 422 with the contract error name', async () => {
    h.chain.failSimulationWith = 'HostError: Error(Contract, #14)';
    const res = await prepare({ fn: 'pay_quota', groupId: 0, index: 0 });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'contract_error', message: 'AlreadyPaid' });
  });

  it('rejects a signature that is not the wallet’s, in the wrong shape, or in the wrong number', async () => {
    const p = await prepared();
    const body = { transaction: p.transaction, validUntilLedger: p.validUntilLedger };
    const forged = await relay({ ...body, signatures: [sign(other, p.payloads[0]!.payload)] });
    expect(forged.json().code).toBe('bad_signatures');
    expect((await relay({ ...body, signatures: ['abcd'] })).json().code).toBe('bad_signatures');
    expect((await relay({ ...body, signatures: [sign(userKp, p.payloads[0]!.payload), sign(userKp, p.payloads[0]!.payload)] })).json().code).toBe('bad_signatures');
    expect(h.chain.sent).toHaveLength(0);
  });

  it('rejects a signature over another payload (another expiry)', async () => {
    const p = await prepared();
    const res = await relay({ transaction: p.transaction, validUntilLedger: p.validUntilLedger + 1, signatures: [sign(userKp, p.payloads[0]!.payload)] });
    expect(res.statusCode).toBe(400);
    expect(h.chain.sent).toHaveLength(0);
  });

  it('rejects an expired or far-future authorization', async () => {
    const p = await prepared();
    const sig = [sign(userKp, p.payloads[0]!.payload)];
    h.chain.ledgerSeq += 500;
    const late = await relay({ transaction: p.transaction, validUntilLedger: p.validUntilLedger, signatures: sig });
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe('authorization_expired');
    const far = await relay({ transaction: p.transaction, validUntilLedger: h.chain.ledgerSeq + 10_000, signatures: sig });
    expect(far.json().code).toBe('bad_expiry');
  });

  it('re-validates the XDR: a tampered transaction is not paid for', async () => {
    const p = await prepared();
    const sig = [sign(userKp, p.payloads[0]!.payload)];
    const tx = TransactionBuilder.fromXDR(p.transaction, PASSPHRASE) as Transaction;
    const op = tx.operations[0]!;
    if (op.type !== 'invokeHostFunction') throw new Error('expected an invoke');
    const rebuild = (source: string, func = op.func, fee = '100000') =>
      new TransactionBuilder(new Account(source, '1'), { fee, networkPassphrase: PASSPHRASE })
        .addOperation(Operation.invokeHostFunction({ func, auth: op.auth }))
        .setTimeout(60)
        .build()
        .toXDR();
    const attempt = async (transaction: string) => (await relay({ transaction, validUntilLedger: p.validUntilLedger, signatures: sig })).json().code;

    // the client makes itself the source, asks for another function, or raises the fee
    expect(await attempt(rebuild(user))).toBe('wrong_source');
    const kyc = invokeFunc(h.chain.contractId, 'approve_kyc', [addr(user)]);
    expect(await attempt(rebuild(h.sponsor.publicKey(), kyc))).toBe('forbidden_function');
    expect(await attempt(rebuild(h.sponsor.publicKey(), op.func, '999999999'))).toBe('fee_too_high');
    expect(await attempt('AAAA')).toBe('bad_transaction');
    expect(h.chain.sent).toHaveLength(0);
  });

  it('checks again what the fresh simulation produced: a fee that grew since prepare is not paid', async () => {
    const p = await prepared();
    h.chain.fee = '999999999'; // the network got expensive between the two steps
    const res = await relay({ transaction: p.transaction, validUntilLedger: p.validUntilLedger, signatures: [sign(userKp, p.payloads[0]!.payload)] });
    expect(res.json().code).toBe('fee_too_high');
    expect(h.chain.sent).toHaveLength(0);
  });

  it('enforces the per-user daily limit and the sponsor reserve', async () => {
    const limited = await harness({ RELAY_USER_DAILY_TX: '1' });
    limited.chain.accounts.add(user);
    limited.chain.groupList = [group()];
    limited.chain.owners.set(0, [user]);
    const go = async () => {
      const p = (await limited.app.inject({ method: 'POST', url: '/v1/tx/prepare', headers: bearer(user), payload: { fn: 'claim_prize', groupId: 0, index: 0 } })).json();
      return limited.app.inject({
        method: 'POST',
        url: '/v1/tx/relay',
        headers: bearer(user),
        payload: { transaction: p.transaction, validUntilLedger: p.validUntilLedger, signatures: [sign(userKp, p.payloads[0].payload)] },
      });
    };
    expect((await go()).statusCode).toBe(200);
    const second = await go();
    expect(second.statusCode).toBe(429);
    expect(second.json().code).toBe('user_limit');
    await limited.close();

    const poor = await harness();
    poor.chain.accounts.add(user);
    poor.chain.groupList = [group()];
    poor.chain.owners.set(0, [user]);
    poor.chain.xlm.set(poor.sponsor.publicKey(), 1_000n);
    const p = (await poor.app.inject({ method: 'POST', url: '/v1/tx/prepare', headers: bearer(user), payload: { fn: 'claim_prize', groupId: 0, index: 0 } })).json();
    const res = await poor.app.inject({
      method: 'POST',
      url: '/v1/tx/relay',
      headers: bearer(user),
      payload: { transaction: p.transaction, validUntilLedger: p.validUntilLedger, signatures: [sign(userKp, p.payloads[0].payload)] },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('sponsor_funds');
    expect(poor.chain.sent).toHaveLength(0);
    await poor.close();
  });

  it('requires a signed-in user', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/tx/prepare', payload: { fn: 'join_group', groupId: 0 } });
    expect(res.statusCode).toBe(401);
  });
});
