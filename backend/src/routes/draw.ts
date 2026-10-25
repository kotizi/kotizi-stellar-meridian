import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import { assertBudget } from '../relay/budget.js';
import { HttpError, requireAuth } from './common.js';

/**
 * POST /v1/groups/:id/draw: "draw now". request_draw and settle_draw need no user signature, so
 * instead of relaying a transaction the keeper runs the next step itself. Returns the action taken, or
 * `action: null` with a `reason` (not_due, no_eligible_cotas, waiting_for_randomness, completed)
 * when nothing can be done yet.
 */
export function drawRoutes(app: FastifyInstance, deps: Deps) {
  app.post<{ Params: { id: string } }>('/v1/groups/:id/draw', { preHandler: requireAuth(deps) }, async (req) => {
    if (!/^\d{1,8}$/.test(req.params.id)) throw new HttpError(400, 'bad_group_id', 'Not a valid group id');
    const group = await deps.chain.group(Number(req.params.id));
    if (!group) throw new HttpError(404, 'not_found', 'Group not found');

    await assertBudget(deps, req.user.userId, 0);
    const result = await app.keeper.advance(group, req.user.userId);
    if ('error' in result && result.error) throw new HttpError(422, 'draw_failed', result.error);
    app.invalidateReads();
    return {
      action: result.action,
      txHash: 'txHash' in result ? (result.txHash ?? null) : null,
      reason: 'reason' in result ? result.reason : null,
    };
  });
}
