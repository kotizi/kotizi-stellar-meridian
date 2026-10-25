import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Deps } from './deps.js';
import { schema } from './db/index.js';
import { GroupStatus, type RawGroup } from './stellar/chain.js';
import { StellarTxError } from './stellar/errors.js';
import { addr, bytes32, invokeFunc, u32 } from './stellar/invoke.js';
import { withAccountLock } from './stellar/lock.js';

/** Mirrors contract COMMIT_EXPIRY: a pending draw may be requested again past `commit_ledger + 720`. */
export const COMMIT_EXPIRY = 720;

export type Step = 'request' | 'settle';
export type IdleReason = 'completed' | 'not_due' | 'no_eligible_cotas' | 'waiting_for_randomness';

export type KeeperView = Pick<RawGroup, 'status' | 'nextDrawTs' | 'paidBitmap' | 'wonBitmap' | 'commitLedger' | 'committer'>;

/**
 * What a group needs next. A pending draw is settled by whoever committed to it (only they know the
 * secret), so the keeper settles its own commits and, if the commit expired (or was somebody else's
 * and went silent), requests again.
 */
export function nextStep(
  g: KeeperView,
  ctx: { nowSecs: bigint; ledger: number; keeper: string; haveSecret: boolean },
): Step | null {
  if (g.status === GroupStatus.Completed) return null;
  if (g.status === GroupStatus.Open) {
    return ctx.nowSecs >= g.nextDrawTs && (g.paidBitmap & ~g.wonBitmap) !== 0n ? 'request' : null;
  }
  if (ctx.ledger > g.commitLedger + COMMIT_EXPIRY) return 'request';
  if (g.committer === ctx.keeper && ctx.haveSecret && ctx.ledger > g.commitLedger) return 'settle';
  return null;
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
 * Drives draws forward so nobody has to click. Commit (`request_draw`) and reveal (`settle_draw`) are
 * sent by the keeper key, which pays its own fees. Claiming stays with the winner (the NFT owner).
 *
 * TODO(vrf): the keeper knows the secret, so it knows the outcome before revealing (see PLAN.md, Randomness).
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
    const { chain, keeper } = this.deps;
    const secret = g.status === GroupStatus.DrawPending ? await this.secretFor(g.commitment) : undefined;
    const step = nextStep(g, {
      nowSecs: BigInt(Math.floor(Date.now() / 1000)),
      ledger: await chain.ledger(),
      keeper: keeper.publicKey(),
      haveSecret: secret !== undefined,
    });
    if (!step) return null;
    try {
      const txHash = step === 'request' ? await this.request(g) : await this.settle(g, secret!);
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

  private async secretFor(commitmentHex: string): Promise<string | undefined> {
    const [row] = await this.deps.db.select().from(schema.drawSecrets).where(eq(schema.drawSecrets.commitment, commitmentHex)).limit(1);
    return row?.secret;
  }

  /** Stores the secret before the commit is sent: a crash in between must not lose the ability to reveal. */
  private async request(g: RawGroup): Promise<string> {
    const { chain, keeper, db } = this.deps;
    const secret = randomBytes(32);
    const commitment = createHash('sha256').update(secret).digest('hex');
    await db.insert(schema.drawSecrets).values({ commitment, groupId: g.id, secret: secret.toString('hex') });
    return this.send(invokeFunc(chain.contractId, 'request_draw', [u32(g.id), addr(keeper.publicKey()), bytes32(commitment)]));
  }

  private async settle(g: RawGroup, secretHex: string): Promise<string> {
    const { chain } = this.deps;
    const txHash = await this.send(invokeFunc(chain.contractId, 'settle_draw', [u32(g.id), bytes32(secretHex)]));
    await this.deps.db.delete(schema.drawSecrets).where(eq(schema.drawSecrets.commitment, g.commitment));
    return txHash;
  }

  /** The keeper account is the transaction source, so its signature also authorizes the call. */
  private async send(func: Parameters<Deps['chain']['invokeTx']>[1]): Promise<string> {
    const { chain, keeper } = this.deps;
    return withAccountLock(keeper.publicKey(), async () => {
      const { transaction } = await chain.invokeTx(keeper.publicKey(), func);
      transaction.sign(keeper);
      return chain.send(transaction);
    });
  }
}
