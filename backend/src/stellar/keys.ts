import { readFileSync } from 'node:fs';
import { Keypair } from '@stellar/stellar-sdk';

/** Reads a secret seed ("S...") from a file kept outside git. The seed is never logged. */
export function loadKeypair(path: string): Keypair {
  const seed = readFileSync(path, 'utf8').trim();
  try {
    return Keypair.fromSecret(seed);
  } catch {
    throw new Error(`${path} does not contain a valid Stellar secret seed`);
  }
}

/** Where a role's key comes from: a file, or the seed itself (from a secret environment variable). */
export type KeySource = { file?: string; secret?: string };

type KeyConfig = {
  SPONSOR_KEYFILE?: string;
  SPONSOR_SECRET?: string;
  KEEPER_KEYFILE?: string;
  KEEPER_SECRET?: string;
  KYC_KEYFILE?: string;
  KYC_SECRET?: string;
  MINT_KEYFILE?: string;
  MINT_SECRET?: string;
  FAUCET_ENABLED: boolean;
};

/** The keys of the roles that are configured; the keeper defaults to the sponsor, the mint key needs the faucet. */
export function loadKeys(config: KeyConfig) {
  const cache = new Map<string, Keypair>();
  const one = (src: KeySource): Keypair | undefined => {
    const id = src.secret ? `seed:${src.secret}` : src.file ? `file:${src.file}` : undefined;
    if (!id) return undefined;
    let kp = cache.get(id);
    if (!kp) {
      kp = src.secret ? keypairFromSeed(src.secret, 'a *_SECRET variable') : loadKeypair(src.file!);
      cache.set(id, kp);
    }
    return kp;
  };
  const sponsor = one({ file: config.SPONSOR_KEYFILE, secret: config.SPONSOR_SECRET });
  if (!sponsor) throw new Error('SPONSOR_KEYFILE or SPONSOR_SECRET is required');
  return {
    sponsor,
    keeper: one({ file: config.KEEPER_KEYFILE, secret: config.KEEPER_SECRET }) ?? sponsor,
    kycSigner: one({ file: config.KYC_KEYFILE, secret: config.KYC_SECRET }),
    mintSigner: config.FAUCET_ENABLED ? one({ file: config.MINT_KEYFILE, secret: config.MINT_SECRET }) : undefined,
  };
}

function keypairFromSeed(seed: string, from: string): Keypair {
  try {
    return Keypair.fromSecret(seed);
  } catch {
    throw new Error(`${from} does not contain a valid Stellar secret seed`);
  }
}
