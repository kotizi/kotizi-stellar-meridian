import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export type DbHandle = { db: Db; close: () => Promise<void> };

/**
 * Postgres when `url` is set (production), otherwise embedded PGlite: persisted in `dir`, or
 * in memory when `dir` is `memory://` (tests). Migrations run on start.
 */
export async function openDb(opts: { url?: string; dir?: string }): Promise<DbHandle> {
  if (opts.url) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const { default: postgres } = await import('postgres');
    const client = postgres(opts.url, { max: 10 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => client.end() };
  }
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const { PGlite } = await import('@electric-sql/pglite');
  const client = new PGlite(opts.dir ?? 'memory://');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}
