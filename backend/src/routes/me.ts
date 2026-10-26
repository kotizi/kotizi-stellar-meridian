import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import { toGroupView } from '../stellar/views.js';
import { requireAuth } from './common.js';

export function meRoutes(app: FastifyInstance, deps: Deps) {
  const { chain } = deps;

  /** Everything the dashboard needs about the signed-in user: wallets, KYC, token balances and owned cotas. */
  app.get('/v1/me', { preHandler: requireAuth(deps) }, async (req) => {
    const mine = new Set(req.user.wallets);
    const tokens = await chain.tokens();
    const wallets = await Promise.all(
      req.user.wallets.map(async (address) => {
        const active = await chain.accountExists(address);
        const holdings = await Promise.all(
          tokens.map(async (t) => [t.token, active ? await chain.tokenHolding(address, t.token) : undefined] as const),
        );
        return {
          address,
          active,
          kyc: active ? await chain.isKyc(address) : false,
          /** Balance per enabled token (contract id -> base units). */
          balances: Object.fromEntries(holdings.map(([token, h]) => [token, (h?.balance ?? 0n).toString()])),
          /**
           * Whether the wallet can hold each token (contract id -> bool). False means a Stellar Asset (USDC...) that needs
           * a trustline the wallet does not have yet: it cannot pay or receive prizes in that token until it adds one.
           * `null` until the account is active, when it cannot be known.
           */
          trustlines: Object.fromEntries(holdings.map(([token, h]) => [token, h ? h.trustline : null])),
        };
      }),
    );

    const [cfg, groups] = await Promise.all([chain.config(), chain.groups()]);
    const ctx = { contractId: chain.contractId, admin: cfg.admin, decimals: new Map(tokens.map((t) => [t.token, t.decimals])) };
    const cotas = (
      await Promise.all(
        groups.map(async (g) => {
          const owners = await app.ownersOf(g.id);
          const indexes = owners.flatMap((o, i) => (mine.has(o) ? [i] : []));
          if (indexes.length === 0) return [];
          const view = toGroupView(g, g.wonBitmap === 0n ? [] : await chain.winners(g.id), ctx);
          return indexes.map((index) => ({
            group: view.id,
            groupName: g.name,
            index,
            owner: owners[index]!,
            paidThisRound: view.paidIndexes.includes(index),
            alreadyWon: view.wonIndexes.includes(index),
            canClaim: view.unclaimedIndexes.includes(index),
            // gross prize of this cota (0 until it wins); the fee is taken when it is claimed
            prize: view.winners.find((w) => w.index === index)?.prize ?? '0',
          }));
        }),
      )
    ).flat();

    return { userId: req.user.userId, wallets, cotas };
  });
}
