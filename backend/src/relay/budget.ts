import { and, eq, gte, sql } from 'drizzle-orm';
import type { Deps } from '../deps.js';
import { schema } from '../db/index.js';
import { HttpError } from '../routes/common.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Throws when sponsoring one more transaction for `userId` would break the user's daily
 * transaction count.
 */
export async function assertBudget(deps: Deps, userId: string): Promise<void> {
  const { db, config } = deps;
  const since = new Date(Date.now() - DAY_MS);

  const [mine] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.sponsoredTx)
    .where(and(eq(schema.sponsoredTx.userId, userId), gte(schema.sponsoredTx.createdAt, since)));
  if ((mine?.n ?? 0) >= config.RELAY_USER_DAILY_TX) {
    throw new HttpError(429, 'user_limit', 'Daily sponsored transaction limit reached');
  }

  // TODO(stellar): global daily stroops budget and sponsor-balance reserve check (needs the RPC client).
}
