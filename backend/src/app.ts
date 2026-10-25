import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { RelayError } from './relay/validate.js';
import type { Deps } from './deps.js';
import { Keeper } from './keeper.js';
import { HttpError } from './routes/common.js';
import { drawRoutes } from './routes/draw.js';
import { groupRoutes } from './routes/groups.js';
import { infoRoutes } from './routes/info.js';
import { meRoutes } from './routes/me.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { relayRoutes } from './routes/relay.js';

/** Name, message and the nested cause chain as plain strings, safe to log and to return in dev. */
export function describeError(e: unknown): string {
  const parts: string[] = [];
  for (let cur: unknown = e, i = 0; cur && i < 4; i++) {
    const x = cur as { name?: string; message?: string; cause?: unknown };
    parts.push(`${x.name ?? 'Error'}: ${x.message ?? String(cur)}`);
    cur = x.cause;
  }
  return parts.join(' <- ');
}

export async function buildApp(deps: Deps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? deps.config.NODE_ENV !== 'test',
    bodyLimit: 16 * 1024,
    trustProxy: deps.config.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin: deps.config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    methods: ['GET', 'POST', 'OPTIONS'],
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ code: err.code, message: err.message });
    if (err instanceof RelayError) return reply.code(err.status).send({ code: err.code, message: err.message });
    if (err instanceof ZodError) {
      return reply.code(400).send({ code: 'bad_request', message: 'Invalid request body', issues: err.issues });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ error: describeError(err) }, 'unhandled error');
    const detail = deps.config.NODE_ENV === 'production' ? undefined : describeError(err);
    return reply.code(status).send({
      code: status === 429 ? 'rate_limited' : 'internal',
      message: status >= 500 ? (detail ? `Internal error: ${detail}` : 'Internal error') : String((err as Error).message),
    });
  });

  app.decorate('keeper', new Keeper(deps, app.log));
  infoRoutes(app, deps);
  groupRoutes(app, deps);
  meRoutes(app, deps);
  onboardingRoutes(app, deps);
  relayRoutes(app, deps);
  drawRoutes(app, deps);
  return app;
}
