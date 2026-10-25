import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { prepareRelay, relay } from '../relay/service.js';
import { RELAY_FUNCTIONS } from '../relay/validate.js';
import { HttpError, pickWallet, requireAuth } from './common.js';

const prepareBody = z.object({
  fn: z.enum(RELAY_FUNCTIONS),
  groupId: z.number().int().nonnegative(),
  /** Cota index: required for pay_quota and claim_prize. */
  index: z.number().int().min(0).max(63).optional(),
  wallet: z.string().optional(),
});

const relayBody = z.object({
  transaction: z.string().min(1).max(20_000),
  validUntilLedger: z.number().int().positive(),
  signatures: z.array(z.string()).min(1).max(4),
});

/**
 * Two steps, so the user's wallet only ever signs an authorization (never a transaction envelope):
 *  - POST /v1/tx/prepare {fn, groupId, index?}: the API builds and simulates the call with the sponsor as
 *    source and answers the payloads to sign (one per authorization entry) plus the transaction;
 *  - POST /v1/tx/relay {transaction, validUntilLedger, signatures}: the API re-validates, signs the entries
 *    with those signatures, simulates again, adds the sponsor signature and sends.
 */
export function relayRoutes(app: FastifyInstance, deps: Deps) {
  app.post('/v1/tx/prepare', { preHandler: requireAuth(deps) }, async (req) => {
    const body = prepareBody.parse(req.body);
    if (body.fn !== 'join_group' && body.index === undefined) {
      throw new HttpError(400, 'bad_request', `${body.fn} needs a cota index`);
    }
    const wallet = pickWallet(req, body.wallet);
    return prepareRelay(deps, req.user, { fn: body.fn, groupId: body.groupId, index: body.index, wallet });
  });

  app.post('/v1/tx/relay', { preHandler: requireAuth(deps) }, async (req) => {
    const result = await relay(deps, req.user, relayBody.parse(req.body));
    app.invalidateReads();
    return result;
  });
}
