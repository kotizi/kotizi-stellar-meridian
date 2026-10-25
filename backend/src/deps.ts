import type { AuthUser, Authenticator } from './auth/index.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { Keeper } from './keeper.js';

export type Deps = {
  config: Config;
  db: Db;
  auth: Authenticator;
  // TODO(stellar): RPC client, sponsor/KYC/mint signers (task 5).
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
