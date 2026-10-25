import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import { memo } from '../util.js';
import { toGroupView } from '../stellar/views.js';
import { HttpError } from './common.js';

export function groupRoutes(app: FastifyInstance, deps: Deps) {
  const { chain } = deps;

  const groups = memo(3_000, async () => {
    const [cfg, raw] = await Promise.all([chain.config(), chain.groups()]);
    const ctx = { contractId: chain.contractId, admin: cfg.admin, token: cfg.token };
    return Promise.all(raw.map(async (g) => toGroupView(g, g.wonBitmap === 0n ? [] : await chain.winners(g.id), ctx)));
  });
  const owners = new Map<number, ReturnType<typeof memo<string[]>>>();
  const ownersOf = (id: number) => {
    let m = owners.get(id);
    if (!m) owners.set(id, (m = memo(3_000, () => chain.cotaOwners(id))));
    return m();
  };
  // transactions change what these show, so the relay drops the caches after each success
  app.decorate('invalidateReads', () => {
    groups.reset();
    owners.clear();
  });

  const idOf = (raw: string) => {
    if (!/^\d{1,8}$/.test(raw)) throw new HttpError(400, 'bad_group_id', 'Not a valid group id');
    return Number(raw);
  };

  app.get('/v1/groups', async () => ({ groups: await groups() }));

  app.get<{ Params: { id: string } }>('/v1/groups/:id', async (req) => {
    const group = (await groups()).find((g) => g.groupId === idOf(req.params.id));
    if (!group) throw new HttpError(404, 'not_found', 'Group not found');
    return group;
  });

  /** The cotas of a group with the current owner of each membership NFT. */
  app.get<{ Params: { id: string } }>('/v1/groups/:id/members', async (req) => {
    const id = idOf(req.params.id);
    const group = (await groups()).find((g) => g.groupId === id);
    if (!group) throw new HttpError(404, 'not_found', 'Group not found');
    const list = await ownersOf(id);
    const members = await Promise.all(
      list.map(async (owner, index) => ({
        index,
        owner,
        totalPaid: (await chain.totalPaid(id, index)).toString(),
        paidThisRound: group.paidIndexes.includes(index),
        won: group.wonIndexes.includes(index),
        prize: group.winners.find((w) => w.index === index)?.prize ?? '0',
        claimable: group.unclaimedIndexes.includes(index),
      })),
    );
    return { group: group.id, members };
  });

  app.decorate('ownersOf', ownersOf);
}

declare module 'fastify' {
  interface FastifyInstance {
    ownersOf: (id: number) => Promise<string[]>;
  }
}
