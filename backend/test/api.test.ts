import { scValToNative } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GroupStatus } from '../src/stellar/chain.js';
import { bearer, callOf, harness, type Harness } from './app-helper.js';
import { TOKEN, group, newKey } from './fake-chain.js';

let h: Harness;
const user = newKey().publicKey();
const other = newKey().publicKey();

beforeEach(async () => {
  h = await harness();
});
afterEach(() => h.close());

const get = (url: string, who?: string) => h.app.inject({ method: 'GET', url, headers: who ? bearer(who) : {} });
const post = (url: string, who: string, payload: object = {}) => h.app.inject({ method: 'POST', url, headers: bearer(who), payload });

describe('reads', () => {
  beforeEach(() => {
    h.chain.groupList = [
      group({ id: 0, paidBitmap: 0b001n, wonBitmap: 0b110n, unclaimedBitmap: 0b100n, unclaimedTotal: 300_000_000n, vault: 400_000_000n, round: 2 }),
      group({ id: 1, name: 'Casa Ipê', membersJoined: 1 }),
    ];
    h.chain.winnerList.set(0, [
      { index: 1, gross: 300_000_000n, wonRound: 0 },
      { index: 2, gross: 300_000_000n, wonRound: 1 },
    ]);
    h.chain.owners.set(0, [user, other, user]);
    h.chain.owners.set(1, [other]);
  });

  it('GET /healthz and /v1/config', async () => {
    expect((await get('/healthz')).json()).toEqual({ ok: true });
    const cfg = (await get('/v1/config')).json();
    expect(cfg).toMatchObject({ contractId: h.chain.contractId, admin: h.chain.admin, token: TOKEN, kycMode: 'auto', faucet: true });
    expect(cfg.sponsor).toBe(h.sponsor.publicKey());
    expect(JSON.stringify(cfg)).not.toMatch(/S[A-Z2-7]{55}/); // no secret seed anywhere
  });

  it('GET /v1/groups answers the shape the frontend expects (bigints as strings, bitmaps as indexes)', async () => {
    const { groups } = (await get('/v1/groups')).json();
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      id: '0',
      groupId: 0,
      organizer: h.chain.admin,
      mint: TOKEN,
      quotaAmount: '100000000',
      periodSecs: '60',
      status: 'Open',
      round: 2,
      paidIndexes: [0],
      wonIndexes: [1, 2],
      unclaimedIndexes: [2],
      unclaimedTotal: '300000000',
      winners: [
        { index: 1, round: 0, prize: '300000000', claimed: true },
        { index: 2, round: 1, prize: '300000000', claimed: false },
      ],
    });
    expect(groups[1].winners).toEqual([]);
  });

  it('GET /v1/groups/:id and /members', async () => {
    expect((await get('/v1/groups/1')).json().name).toBe('Casa Ipê');
    expect((await get('/v1/groups/9')).statusCode).toBe(404);
    expect((await get('/v1/groups/abc')).statusCode).toBe(400);
    const { members } = (await get('/v1/groups/0/members')).json();
    expect(members.map((m: { owner: string; won: boolean; claimable: boolean }) => [m.owner === user, m.won, m.claimable])).toEqual([
      [true, false, false],
      [false, true, false],
      [true, true, true],
    ]);
  });

  it('GET /v1/me lists the user’s wallets and cotas, and needs a token', async () => {
    expect((await get('/v1/me')).statusCode).toBe(401);
    h.chain.accounts.add(user);
    h.chain.kyc.add(user);
    h.chain.usdc.set(user, 5_000_000n);
    const me = (await get('/v1/me', user)).json();
    expect(me.wallets).toEqual([{ address: user, active: true, kyc: true, usdc: '5000000' }]);
    expect(me.cotas.map((c: { group: string; index: number; canClaim: boolean; prize: string }) => [c.group, c.index, c.canClaim, c.prize])).toEqual([
      ['0', 0, false, '0'],
      ['0', 2, true, '300000000'],
    ]);
  });
});

describe('onboarding', () => {
  it('POST /v1/kyc activates the account, then approves with the KYC key as source', async () => {
    const res = await post('/v1/kyc', user);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ wallet: user, status: 'approved' });
    expect(h.chain.createdAccounts).toEqual([user]);
    const { tx } = h.chain.sent[0]!;
    expect(tx.source).toBe(h.kyc.publicKey());
    expect(callOf(tx).fn).toBe('approve_kyc');
    expect(scValToNative(callOf(tx).args[0]!)).toBe(user);
  });

  it('is idempotent for an approved wallet and refuses a wallet that is not the user’s', async () => {
    h.chain.accounts.add(user);
    h.chain.kyc.add(user);
    expect((await post('/v1/kyc', user)).json()).toMatchObject({ alreadyApproved: true });
    expect(h.chain.sent).toHaveLength(0);
    expect((await post('/v1/kyc', user, { wallet: other })).statusCode).toBe(403);
  });

  it('answers 501 when automatic KYC is off', async () => {
    const off = await harness({ KYC_MODE: 'off' });
    off.chain.accounts.add(user);
    const res = await off.app.inject({ method: 'POST', url: '/v1/kyc', headers: bearer(user), payload: {} });
    expect(res.statusCode).toBe(501);
    await off.close();
  });

  it('POST /v1/faucet mints test USDC with the token admin key, once a day per wallet', async () => {
    const res = await post('/v1/faucet', user);
    expect(res.statusCode).toBe(200);
    expect(res.json().amount).toBe('1000000000');
    const { tx } = h.chain.sent[0]!;
    expect(tx.source).toBe(h.mint.publicKey());
    expect(callOf(tx).fn).toBe('mint');
    const again = await post('/v1/faucet', user);
    expect(again.statusCode).toBe(429);
    expect(h.chain.sent).toHaveLength(1);
  });
});

describe('POST /v1/groups/:id/draw', () => {
  it('runs the next keeper step, or says why there is none', async () => {
    h.chain.groupList = [group({ nextDrawTs: 1n, paidBitmap: 0b1n }), group({ id: 1, status: GroupStatus.Completed })];
    const started = (await post('/v1/groups/0/draw', user)).json();
    expect(started).toMatchObject({ action: 'request', reason: null });
    expect(started.txHash).toBeTruthy();
    expect(callOf(h.chain.sent[0]!.tx).fn).toBe('request_draw');

    expect((await post('/v1/groups/1/draw', user)).json()).toEqual({ action: null, txHash: null, reason: 'completed' });
    expect((await post('/v1/groups/7/draw', user)).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'POST', url: '/v1/groups/0/draw' })).statusCode).toBe(401);
  });

  it('reports a failed step as 422 with the contract error', async () => {
    h.chain.groupList = [group({ nextDrawTs: 1n, paidBitmap: 0b1n })];
    h.chain.failSimulationWith = 'HostError: Error(Contract, #18)';
    const res = await post('/v1/groups/0/draw', user);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'draw_failed', message: 'DrawNotDue' });
  });
});
