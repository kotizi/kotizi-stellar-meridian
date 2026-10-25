import { scValToNative } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../src/db/index.js';
import { GENESIS, PERIOD, roundTime } from '../src/drand.js';
import { DRAW_EXPIRY_SECS, Keeper, SETTLE_SLACK_SECS, idleReason, nextStep, type KeeperView } from '../src/keeper.js';
import { GroupStatus } from '../src/stellar/chain.js';
import { callOf, harness, type Harness } from './app-helper.js';
import { group } from './fake-chain.js';

const ROUND = 1_000_000n;
const base: KeeperView = {
  status: GroupStatus.Open,
  nextDrawTs: 100n,
  paidBitmap: 0b111n,
  wonBitmap: 0n,
  drawRound: 0n,
};
const pending: KeeperView = { ...base, status: GroupStatus.DrawPending, drawRound: ROUND };
const published = roundTime(ROUND);

describe('keeper decisions', () => {
  it('requests a draw when due and someone eligible has paid, whatever the unclaimed prizes', () => {
    expect(nextStep(base, { nowSecs: 100n })).toBe('request');
    expect(nextStep(base, { nowSecs: 99n })).toBeNull(); // not due
    expect(nextStep({ ...base, paidBitmap: 0n }, { nowSecs: 100n })).toBeNull(); // nobody paid
    expect(nextStep({ ...base, paidBitmap: 0b11n, wonBitmap: 0b11n }, { nowSecs: 100n })).toBeNull(); // all payers already won
    expect(nextStep({ ...base, status: GroupStatus.Completed }, { nowSecs: 100n })).toBeNull();
  });

  it('settles a pending draw only once its drand round has been published', () => {
    expect(nextStep(pending, { nowSecs: published - 1n })).toBeNull();
    expect(nextStep(pending, { nowSecs: published + SETTLE_SLACK_SECS - 1n })).toBeNull(); // ledger clocks trail a little
    expect(nextStep(pending, { nowSecs: published + SETTLE_SLACK_SECS })).toBe('settle');
  });

  it('requests again when the round went unsettled past the contract’s expiry', () => {
    expect(nextStep(pending, { nowSecs: published + DRAW_EXPIRY_SECS })).toBe('settle'); // still inside the window
    expect(nextStep(pending, { nowSecs: published + DRAW_EXPIRY_SECS + 1n })).toBe('request');
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
  const signature = new Uint8Array(96).fill(7);
  /** The drand round being published right now. */
  const currentRound = () => (BigInt(Math.floor(Date.now() / 1000)) - GENESIS) / PERIOD + 1n;
  const published = () => currentRound() - 20n; // a minute ago: past the settle slack, inside the expiry
  beforeEach(async () => {
    h = await harness();
    keeper = new Keeper(h.deps, { info() {}, warn() {}, error() {} });
    h.chain.groupList = [group({ paidBitmap: 0b11n, nextDrawTs: 1n })]; // due long ago
  });
  afterEach(() => h.close());

  it('requests the draw with the keeper as source and no secret, then settles with the published beacon', async () => {
    const [req] = await keeper.tick();
    expect(req).toMatchObject({ group: 0, action: 'request' });
    const sent = callOf(h.chain.sent[0]!.tx);
    expect(sent.fn).toBe('request_draw');
    expect(sent.args).toHaveLength(1); // just the group id
    expect(h.chain.sent[0]!.tx.source).toBe(h.keeper.publicKey());
    expect(h.chain.sent[0]!.tx.signatures).toHaveLength(1);

    // the chain now waits for an old (already published) round, and the relay has it
    const round = published();
    h.chain.groupList = [group({ paidBitmap: 0b11n, status: GroupStatus.DrawPending, drawRound: round })];
    h.beacons.published.set(round, signature);
    const [settle] = await keeper.tick();
    expect(settle).toMatchObject({ action: 'settle' });
    const reveal = callOf(h.chain.sent[1]!.tx);
    expect(reveal.fn).toBe('settle_draw');
    expect(Buffer.from(scValToNative(reveal.args[1]!) as Uint8Array)).toEqual(Buffer.from(signature));
    expect(h.beacons.requested).toEqual([round]);
  });

  it('waits quietly while drand has not published the round', async () => {
    const round = published(); // old enough to settle, but the relay has nothing for it
    h.chain.groupList = [group({ paidBitmap: 0b11n, status: GroupStatus.DrawPending, drawRound: round })];
    expect(await keeper.tick()).toEqual([]);
    expect(h.chain.sent).toHaveLength(0);
    expect(h.beacons.requested).toEqual([round]);
    h.chain.groupList = [group({ paidBitmap: 0b11n, status: GroupStatus.DrawPending, drawRound: currentRound() + 100n })];
    expect(await keeper.tick()).toEqual([]);
    expect(h.beacons.requested).toEqual([round]); // a future round is not even asked for
  });

  it('reports a failed settle and tries again on the next tick', async () => {
    const round = published();
    h.chain.groupList = [group({ paidBitmap: 0b11n, status: GroupStatus.DrawPending, drawRound: round })];
    h.beacons.published.set(round, signature);
    h.chain.failSimulationWith = 'HostError: Error(Contract, #23)';
    const [failed] = await keeper.tick();
    expect(failed).toMatchObject({ action: 'settle', error: 'InvalidBeacon' });
    h.chain.failSimulationWith = undefined;
    expect(await keeper.tick()).toMatchObject([{ action: 'settle' }]);
  });

  it('records each step in the audit table and re-requests an expired round', async () => {
    h.chain.groupList = [group({ paidBitmap: 0b11n, status: GroupStatus.DrawPending, drawRound: ROUND })]; // years old
    const [a] = await keeper.tick();
    expect(a).toMatchObject({ action: 'request' });
    const rows = await h.deps.db.select().from(schema.sponsoredTx);
    expect(rows.map((r) => [r.userId, r.kinds])).toEqual([['keeper', 'request_draw']]);
  });
});
