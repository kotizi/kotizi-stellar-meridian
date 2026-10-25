import { createHash } from 'node:crypto';
import { scValToNative } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../src/db/index.js';
import { COMMIT_EXPIRY, Keeper, idleReason, nextStep, type KeeperView } from '../src/keeper.js';
import { GroupStatus } from '../src/stellar/chain.js';
import { callOf, harness, type Harness } from './app-helper.js';
import { group, newKey } from './fake-chain.js';

const me = newKey().publicKey();
const base: KeeperView = {
  status: GroupStatus.Open,
  nextDrawTs: 100n,
  paidBitmap: 0b111n,
  wonBitmap: 0n,
  commitLedger: 1_000,
  committer: null,
};
const ctx = (over: Partial<Parameters<typeof nextStep>[1]> = {}) => ({ nowSecs: 100n, ledger: 0, keeper: me, haveSecret: true, ...over });
const pending: KeeperView = { ...base, status: GroupStatus.DrawPending, committer: me };

describe('keeper decisions', () => {
  it('requests a draw when due and someone eligible has paid, whatever the unclaimed prizes', () => {
    expect(nextStep(base, ctx())).toBe('request');
    expect(nextStep(base, ctx({ nowSecs: 99n }))).toBeNull(); // not due
    expect(nextStep({ ...base, paidBitmap: 0n }, ctx())).toBeNull(); // nobody paid
    expect(nextStep({ ...base, paidBitmap: 0b11n, wonBitmap: 0b11n }, ctx())).toBeNull(); // all payers already won
    expect(nextStep({ ...base, status: GroupStatus.Completed }, ctx())).toBeNull();
  });

  it('settles its own commit once the commit ledger has passed, and only with the secret', () => {
    expect(nextStep(pending, ctx({ ledger: 1_000 }))).toBeNull(); // sequence == commit_ledger: too early
    expect(nextStep(pending, ctx({ ledger: 1_001 }))).toBe('settle');
    expect(nextStep(pending, ctx({ ledger: 1_001, haveSecret: false }))).toBeNull(); // lost the secret: wait for expiry
  });

  it('does not settle somebody else’s commit, and takes over once it expires', () => {
    const theirs = { ...pending, committer: newKey().publicKey() };
    expect(nextStep(theirs, ctx({ ledger: 1_001 }))).toBeNull();
    expect(nextStep(theirs, ctx({ ledger: 1_000 + COMMIT_EXPIRY }))).toBeNull(); // still inside the window
    expect(nextStep(theirs, ctx({ ledger: 1_000 + COMMIT_EXPIRY + 1 }))).toBe('request');
    expect(nextStep(pending, ctx({ ledger: 1_000 + COMMIT_EXPIRY + 1 }))).toBe('request'); // its own, but expired
  });

  it('explains each blocked state', () => {
    expect(idleReason({ ...base, status: GroupStatus.Completed }, 100n)).toBe('completed');
    expect(idleReason(pending, 100n)).toBe('waiting_for_randomness');
    expect(idleReason(base, 99n)).toBe('not_due');
    expect(idleReason(base, 100n)).toBe('no_eligible_cotas');
  });
});

describe('keeper against a chain', () => {
  let h: Harness;
  let keeper: Keeper;
  beforeEach(async () => {
    h = await harness();
    keeper = new Keeper(h.deps, { info() {}, warn() {}, error() {} });
    h.chain.groupList = [group({ paidBitmap: 0b11n, nextDrawTs: 1n })]; // due long ago
  });
  afterEach(() => h.close());

  const secrets = () => h.deps.db.select().from(schema.drawSecrets);

  it('commits with a fresh secret it stored first, then reveals that same secret and forgets it', async () => {
    const [req] = await keeper.tick();
    expect(req).toMatchObject({ group: 0, action: 'request' });
    const sent = callOf(h.chain.sent[0]!.tx);
    expect(sent.fn).toBe('request_draw');
    const commitment = Buffer.from(scValToNative(sent.args[2]!) as Uint8Array).toString('hex');
    const [row] = await secrets();
    expect(createHash('sha256').update(Buffer.from(row!.secret, 'hex')).digest('hex')).toBe(commitment);
    expect(h.chain.sent[0]!.tx.source).toBe(h.keeper.publicKey());
    expect(h.chain.sent[0]!.tx.signatures).toHaveLength(1);

    // the chain now shows the pending draw; nothing to do until the commit ledger has passed
    h.chain.groupList = [group({ paidBitmap: 0b11n, status: GroupStatus.DrawPending, commitment, commitLedger: h.chain.ledgerSeq + 3, committer: h.keeper.publicKey() })];
    expect(await keeper.tick()).toEqual([]);
    h.chain.ledgerSeq += 4;
    const [settle] = await keeper.tick();
    expect(settle).toMatchObject({ action: 'settle' });
    const reveal = callOf(h.chain.sent[1]!.tx);
    expect(reveal.fn).toBe('settle_draw');
    expect(Buffer.from(scValToNative(reveal.args[1]!) as Uint8Array).toString('hex')).toBe(row!.secret);
    expect(await secrets()).toHaveLength(0);
  });

  it('keeps the secret when the reveal fails, so it can try again', async () => {
    await keeper.tick();
    const [row] = await secrets();
    h.chain.groupList = [group({ paidBitmap: 0b11n, status: GroupStatus.DrawPending, commitment: createHash('sha256').update(Buffer.from(row!.secret, 'hex')).digest('hex'), commitLedger: 1_001, committer: h.keeper.publicKey() })];
    h.chain.ledgerSeq = 1_100;
    h.chain.failSimulationWith = 'HostError: Error(Contract, #22)';
    const [failed] = await keeper.tick();
    expect(failed).toMatchObject({ action: 'settle', error: 'DrawTooEarly' });
    expect(await secrets()).toHaveLength(1);
  });

  it('records the commit in the audit table and re-requests an expired one', async () => {
    h.chain.groupList = [group({ paidBitmap: 0b11n, status: GroupStatus.DrawPending, commitLedger: 100, committer: newKey().publicKey() })];
    h.chain.ledgerSeq = 100 + COMMIT_EXPIRY + 1;
    const [a] = await keeper.tick();
    expect(a).toMatchObject({ action: 'request' });
    const rows = await h.deps.db.select().from(schema.sponsoredTx);
    expect(rows.map((r) => [r.userId, r.kinds])).toEqual([['keeper', 'request_draw']]);
  });
});
