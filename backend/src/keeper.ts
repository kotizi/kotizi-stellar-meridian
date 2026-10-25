import type { FastifyBaseLogger } from 'fastify';
import type { Deps } from './deps.js';

export type KeeperAction = { group: string; action: 'request' | 'settle'; txHash?: string; error?: string };

/**
 * Drives draws forward so nobody has to click: requests a draw when a group is due and settles it
 * once the committed ledger's hash exists. Both calls are permissionless, so the keeper is just
 * another caller paying with the sponsor account. Claiming stays with the winner (NFT owner).
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
    this.log.info('keeper started');
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
    // TODO(stellar), task 5: read groups, decide request/settle per group, submit via the sponsor, log in sponsored_tx.
    return [];
  }
}
