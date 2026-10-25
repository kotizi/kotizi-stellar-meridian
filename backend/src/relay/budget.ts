import { and, eq, gte, sql } from 'drizzle-orm';
import type { Deps } from '../deps.js';
import { schema } from '../db/index.js';
import { HttpError } from '../routes/common.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Throws when sponsoring `estStroops` more for `userId` would break a limit: the user's daily
 * transaction count, the global daily stroops budget, or the sponsor account's reserve.
 */
export async function assertBudget(deps: Deps, userId: string, estStroops: number): Promise<void> {
  const { db, chain, config, sponsor } = deps;
  const since = new Date(Date.now() - DAY_MS);

  const [mine] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.sponsoredTx)
    .where(and(eq(schema.sponsoredTx.userId, userId), gte(schema.sponsoredTx.createdAt, since)));
  if ((mine?.n ?? 0) >= config.RELAY_USER_DAILY_TX) {
    throw new HttpError(429, 'user_limit', 'Daily sponsored transaction limit reached');
  }

  const [total] = await db
    .select({ stroops: sql<number>`coalesce(sum(${schema.sponsoredTx.estStroops}), 0)::float8` })
    .from(schema.sponsoredTx)
    .where(gte(schema.sponsoredTx.createdAt, since));
  if ((total?.stroops ?? 0) + estStroops > config.RELAY_GLOBAL_DAILY_STROOPS) {
    throw new HttpError(503, 'sponsor_budget', 'The daily sponsorship budget is used up');
  }

  const balance = await chain.xlmBalance(sponsor.publicKey());
  if (balance < BigInt(config.RELAY_MIN_SPONSOR_STROOPS) + BigInt(estStroops)) {
    throw new HttpError(503, 'sponsor_funds', 'The sponsor account is low on funds');
  }
}
