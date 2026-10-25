import type { Keypair } from '@stellar/stellar-sdk';
import type { AuthUser, Authenticator } from './auth/index.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { Beacons } from './drand.js';
import type { Keeper } from './keeper.js';
import type { Chain } from './stellar/chain.js';

export type Deps = {
  config: Config;
  db: Db;
  auth: Authenticator;
  chain: Chain;
  /** Transaction source and fee payer of relayed calls; pays account activation. */
  sponsor: Keypair;
  /** drand beacons for settle_draw. */
  beacons: Beacons;
  /** Signs request_draw / settle_draw (anyone could; the keeper pays the fees). May be the sponsor key. */
  keeper: Keypair;
  /** Signs approve_kyc (must be the contract's kyc_authority). Only when KYC_MODE=auto. */
  kycSigner?: Keypair;
  /** Mints test USDC (must be the token's admin). Only when FAUCET_ENABLED. */
  mintSigner?: Keypair;
};

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
  interface FastifyInstance {
    invalidateReads: () => void;
    keeper: Keeper;
  }
}
