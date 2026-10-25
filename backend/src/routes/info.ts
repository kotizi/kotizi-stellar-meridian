import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';

export function infoRoutes(app: FastifyInstance, deps: Deps) {
  app.get('/healthz', async () => ({ ok: true }));

  app.get('/v1/config', async () => {
    const [cfg, tokens] = await Promise.all([deps.chain.config(), deps.chain.tokens()]);
    return {
      contractId: deps.chain.contractId,
      rpcUrl: deps.config.STELLAR_RPC_URL,
      networkPassphrase: deps.config.NETWORK_PASSPHRASE,
      admin: cfg.admin,
      kycAuthority: cfg.kycAuthority,
      /** Tokens groups can be created in. */
      tokens,
      /** The account that pays relayed transactions (informational: the wallet never sets it). */
      sponsor: deps.sponsor.publicKey(),
      kycMode: deps.config.KYC_MODE,
      faucet: deps.mintSigner !== undefined,
      /** The test token the faucet mints (undefined when the faucet is off). */
      faucetToken: deps.mintSigner ? deps.config.FAUCET_TOKEN : undefined,
      faucetAmountUsdc: deps.config.FAUCET_AMOUNT_USDC,
    };
  });
}
