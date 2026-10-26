import { rpc } from '@stellar/stellar-sdk';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { DevAuthenticator } from './auth/dev.js';
import { PrivyAuthenticator, privyDirectory } from './auth/privy.js';
import { openDb } from './db/index.js';
import type { Deps } from './deps.js';
import { loadKeys } from './stellar/keys.js';
import { DrandBeacons } from './drand.js';
import { RpcChain } from './stellar/rpc-chain.js';

async function main() {
  const config = loadConfig();
  const { db, close } = await openDb({ url: config.DATABASE_URL, dir: config.PGLITE_DIR });

  const { sponsor, keeper, kycSigner, mintSigner } = loadKeys(config);
  const server = new rpc.Server(config.STELLAR_RPC_URL, { allowHttp: /localhost|127\.0\.0\.1/.test(config.STELLAR_RPC_URL) });
  const chain = new RpcChain(server, config.CONTRACT_ID, config.NETWORK_PASSPHRASE, sponsor);

  const deps: Deps = {
    config,
    db,
    auth:
      config.AUTH_MODE === 'privy'
        ? new PrivyAuthenticator(privyDirectory(config.PRIVY_APP_ID!, config.PRIVY_APP_SECRET!))
        : new DevAuthenticator(),
    chain,
    beacons: new DrandBeacons(config.DRAND_URL),
    sponsor,
    keeper,
    kycSigner,
    mintSigner,
  };

  // Fail fast on a wrong contract id / RPC, and when the server keys don't match the roles they play.
  const contract = await chain.config();
  const app = await buildApp(deps);
  if (deps.kycSigner && deps.kycSigner.publicKey() !== contract.kycAuthority) {
    app.log.warn('The KYC key is not the contract kyc_authority; automatic KYC disabled');
    deps.kycSigner = undefined;
  }
  if (config.KEEPER_ENABLED && keeper.publicKey() !== contract.keeper) {
    app.log.error('The keeper key is not the contract keeper: request_draw will be rejected');
  }
  if (config.AUTH_MODE === 'dev') app.log.warn('AUTH_MODE=dev: tokens are NOT verified. Never expose this.');
  app.log.info({ sponsor: sponsor.publicKey(), contract: config.CONTRACT_ID, rpc: config.STELLAR_RPC_URL }, 'sponsor account');

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
