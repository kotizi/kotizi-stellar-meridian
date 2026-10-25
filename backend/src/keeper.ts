import type { FastifyBaseLogger } from 'fastify';
import type { Deps } from './deps.js';
import { roundTime } from './drand.js';
import { schema } from './db/index.js';
import { GroupStatus, type RawGroup } from './stellar/chain.js';
import { StellarTxError } from './stellar/errors.js';
import { invokeFunc, u32 } from './stellar/invoke.js';
import { withAccountLock } from './stellar/lock.js';
import { nativeToScVal } from '@stellar/stellar-sdk';

/** Mirrors contract DRAW_EXPIRY_SECS: a pending draw may be requested again once its round is this old. */
export const DRAW_EXPIRY_SECS = 3_600n;
/** Seconds past the round's publication before settling: ledger close times trail the wall clock a little. */
export const SETTLE_SLACK_SECS = 6n;

export type Step = 'request' | 'settle';
export type IdleReason = 'completed' | 'not_due' | 'no_eligible_cotas' | 'waiting_for_randomness';

export type KeeperView = Pick<RawGroup, 'status' | 'nextDrawTs' | 'paidBitmap' | 'wonBitmap' | 'drawRound'>;

/**
 * What a group needs next. Anyone can send both steps (the contract verifies the drand signature
 * itself), so the keeper only drives them: request when due, settle once the drand round exists, and
 * request again if the round went unsettled for too long (drand down).
 */
export function nextStep(g: KeeperView, ctx: { nowSecs: bigint }): Step | null {
  if (g.status === GroupStatus.Completed) return null;
  if (g.status === GroupStatus.Open) {
    return ctx.nowSecs >= g.nextDrawTs && (g.paidBitmap & ~g.wonBitmap) !== 0n ? 'request' : null;
  }
  const published = roundTime(g.drawRound);
  if (ctx.nowSecs > published + DRAW_EXPIRY_SECS) return 'request';
  return ctx.nowSecs >= published + SETTLE_SLACK_SECS ? 'settle' : null;
}

/** Why a group has nothing to do right now (when `nextStep` returned null). */
export function idleReason(g: KeeperView, nowSecs: bigint): IdleReason {
  if (g.status === GroupStatus.Completed) return 'completed';
  if (g.status === GroupStatus.DrawPending) return 'waiting_for_randomness';
  if (nowSecs < g.nextDrawTs) return 'not_due';
  return 'no_eligible_cotas';
}

export type KeeperAction = { group: number; action: Step; txHash?: string; error?: string };

/**
 * Drives draws forward so nobody has to click: `request_draw` when due, then `settle_draw` with the
 * drand beacon of the round the contract fixed. The keeper has no say in the outcome and holds no secret
 * (see PLAN.md, Randomness); it only pays the fees. Claiming stays with the winner (the NFT owner).
 */
export class Keeper {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly deps: Deps,
    private readonly log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>,
  ) {}

  start() {
    this.timer = setInterval(() => void this.safeTick(), this.deps.config.KEEPER_INTERVAL_MS);
    this.log.info({ keeper: this.deps.keeper.publicKey() }, 'keeper started');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (e) {
      this.log.error({ err: String(e) }, 'keeper tick failed');
    } finally {
      this.running = false;
    }
  }

  async tick(): Promise<KeeperAction[]> {
    const actions: KeeperAction[] = [];
    for (const g of await this.deps.chain.groups()) {
      const a = await this.step(g);
      if (a) actions.push(a);
    }
    return actions;
  }

  /** One step for one group, on behalf of `userId` (an authenticated "draw now" request). */
  async advance(group: RawGroup, userId: string): Promise<KeeperAction | { action: null; reason: IdleReason }> {
    return (await this.step(group, userId)) ?? { action: null, reason: idleReason(group, BigInt(Math.floor(Date.now() / 1000))) };
  }

  private async step(g: RawGroup, userId = 'keeper'): Promise<KeeperAction | null> {
    const { keeper } = this.deps;
    const step = nextStep(g, { nowSecs: BigInt(Math.floor(Date.now() / 1000)) });
    if (!step) return null;
    try {
      let txHash: string;
      if (step === 'request') {
        txHash = await this.send(invokeFunc(this.deps.chain.contractId, 'request_draw', [u32(g.id)]));
      } else {
        const signature = await this.deps.beacons.signature(g.drawRound);
        if (!signature) return null; // not published yet
        txHash = await this.send(
          invokeFunc(this.deps.chain.contractId, 'settle_draw', [u32(g.id), nativeToScVal(Buffer.from(signature), { type: 'bytes' })]),
        );
      }
      await this.deps.db.insert(schema.sponsoredTx).values({
        userId,
        wallet: keeper.publicKey(),
        txHash,
        kinds: step === 'request' ? 'request_draw' : 'settle_draw',
        estStroops: 0,
      });
      this.log.info({ group: g.id, action: step, txHash }, 'keeper sent');
      return { group: g.id, action: step, txHash };
    } catch (e) {
      const error = e instanceof StellarTxError ? (e.contractError ?? e.message) : e instanceof Error ? e.message : String(e);
      this.log.warn({ group: g.id, action: step, error }, 'keeper step failed');
      return { group: g.id, action: step, error };
    }
  }

  /** The keeper account is the transaction source and pays the fee; the calls need no authorization. */
  private async send(func: Parameters<Deps['chain']['invokeTx']>[1]): Promise<string> {
    const { chain, keeper } = this.deps;
    return withAccountLock(keeper.publicKey(), async () => {
      const { transaction } = await chain.invokeTx(keeper.publicKey(), func);
      transaction.sign(keeper);
      return chain.send(transaction);
    });
  }
}
