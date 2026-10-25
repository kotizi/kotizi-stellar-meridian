import type { Keypair } from '@stellar/stellar-sdk';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { DevAuthenticator } from '../src/auth/dev.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import type { Deps } from '../src/deps.js';
import { CONTRACT, FakeChain, newKey } from './fake-chain.js';

export type Harness = {
  app: FastifyInstance;
  chain: FakeChain;
  deps: Deps;
  sponsor: Keypair;
  keeper: Keypair;
  kyc: Keypair;
  mint: Keypair;
  close: () => Promise<void>;
};

export async function harness(env: Record<string, string> = {}): Promise<Harness> {
  const chain = new FakeChain();
  const [sponsor, keeper, kyc, mint] = [newKey(), newKey(), newKey(), newKey()];
  chain.kycAuthority = kyc.publicKey();
  const config = loadConfig({
    AUTH_MODE: 'dev',
    NODE_ENV: 'test',
    CONTRACT_ID: CONTRACT,
    SPONSOR_KEYFILE: 'unused',
    KYC_MODE: 'auto',
    KYC_KEYFILE: 'unused',
    FAUCET_ENABLED: 'true',
    MINT_KEYFILE: 'unused',
    ...env,
  });
  const { db, close } = await openDb({ dir: 'memory://' });
  const deps: Deps = { config, db, auth: new DevAuthenticator(), chain, sponsor, keeper, kycSigner: kyc, mintSigner: mint };
  const app = await buildApp(deps, { logger: false });
  return { app, chain, deps, sponsor, keeper, kyc, mint, close: async () => (await app.close(), close()) };
}

export const bearer = (...wallets: string[]) => ({ authorization: `Bearer dev:${wallets.join(',')}` });

/** The function name and the native-ish arguments of a sent transaction. */
export function callOf(tx: import('@stellar/stellar-sdk').Transaction) {
  const op = tx.operations[0]!;
  if (op.type !== 'invokeHostFunction' || op.func.type !== 'hostFunctionTypeInvokeContract') throw new Error('not an invoke');
  const c = op.func.invokeContract;
  return { fn: String(c.functionName), args: c.args };
}
