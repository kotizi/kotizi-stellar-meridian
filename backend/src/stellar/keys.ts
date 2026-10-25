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

/** One Keypair per file, so a key can play several roles. */
export function keypairLoader() {
  const cache = new Map<string, Keypair>();
  return (path: string): Keypair => {
    let kp = cache.get(path);
    if (!kp) {
      kp = loadKeypair(path);
      cache.set(path, kp);
    }
    return kp;
  };
}
