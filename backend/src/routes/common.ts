import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthError } from '../auth/index.js';
import type { Deps } from '../deps.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** preHandler: verifies `Authorization: Bearer <token>` and sets `req.user`. */
export function requireAuth(deps: Deps) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized', 'Missing bearer token');
    try {
      req.user = await deps.auth.authenticate(header.slice(7));
    } catch (e) {
      if (e instanceof AuthError) throw new HttpError(401, 'unauthorized', e.message);
      throw e;
    }
  };
}

/** The wallet a request acts for: the one in the body (must belong to the user) or the first linked. */
export function pickWallet(req: FastifyRequest, requested?: string): string {
  const wallets = req.user.wallets;
  if (wallets.length === 0) throw new HttpError(400, 'no_wallet', 'The user has no Stellar wallet yet');
  if (requested === undefined) return wallets[0]!;
  if (!wallets.includes(requested)) throw new HttpError(403, 'not_user_wallet', 'That wallet does not belong to you');
  return requested;
}
