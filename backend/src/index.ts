import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { DevAuthenticator } from './auth/dev.js';
import { PrivyAuthenticator, privyDirectory } from './auth/privy.js';
import { openDb } from './db/index.js';
import type { Deps } from './deps.js';

async function main() {
  const config = loadConfig();
  const { db, close } = await openDb({ url: config.DATABASE_URL, dir: config.PGLITE_DIR });

  const deps: Deps = {
    config,
    db,
    auth:
      config.AUTH_MODE === 'privy'
        ? new PrivyAuthenticator(privyDirectory(config.PRIVY_APP_ID!, config.PRIVY_APP_SECRET!))
        : new DevAuthenticator(),
  };

  const app = await buildApp(deps);
  if (config.AUTH_MODE === 'dev') app.log.warn('AUTH_MODE=dev: tokens are NOT verified. Never expose this.');

  if (config.KEEPER_ENABLED) app.keeper.start();

  await app.listen({ host: config.HOST, port: config.PORT });
  const shutdown = async () => {
    app.keeper.stop();
    await app.close();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
