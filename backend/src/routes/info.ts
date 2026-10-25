import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';

export function infoRoutes(app: FastifyInstance, deps: Deps) {
  app.get('/healthz', async () => ({ ok: true }));

  app.get('/v1/config', async () => {
    const cfg = await deps.chain.config();
    return {
      contractId: deps.chain.contractId,
      rpcUrl: deps.config.STELLAR_RPC_URL,
      networkPassphrase: deps.config.NETWORK_PASSPHRASE,
      admin: cfg.admin,
      kycAuthority: cfg.kycAuthority,
      token: cfg.token,
      /** The account that pays relayed transactions (informational: the wallet never sets it). */
      sponsor: deps.sponsor.publicKey(),
      kycMode: deps.config.KYC_MODE,
      faucet: deps.mintSigner !== undefined,
      faucetAmountUsdc: deps.config.FAUCET_AMOUNT_USDC,
    };
  });
}
