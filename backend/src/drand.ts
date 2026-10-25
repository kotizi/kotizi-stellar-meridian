import { bls12_381 } from '@noble/curves/bls12-381';

/** drand quicknet, as pinned in the contract (`contract/kotizi/src/drand.rs`): same chain, same clock. */
export const QUICKNET_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
export const QUICKNET_PUBLIC_KEY =
  '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a';
export const GENESIS = 1_692_803_367n;
export const PERIOD = 3n;

/** When the beacon of `round` is published (seconds). */
export const roundTime = (round: bigint): bigint => GENESIS + (round - 1n) * PERIOD;

/** Source of beacon signatures in the uncompressed form `settle_draw` takes (96 bytes). */
export interface Beacons {
  /** `null` while the round has not been published yet. Throws if the answer is not a valid signature. */
  signature(round: bigint): Promise<Uint8Array | null>;
}


/** The round's message, as drand signs it: sha256 of the round as 8 big-endian bytes. */
async function message(round: bigint): Promise<Uint8Array> {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(round);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

/**
 * Fetches beacons from a drand HTTP relay. Never trusts it: the signature is verified here against the
 * pinned quicknet key before it is used, so a lying relay can only cause a refusal, not a wrong draw.
 */
export class DrandBeacons implements Beacons {
  constructor(
    private readonly baseUrl = 'https://api.drand.sh',
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async signature(round: bigint): Promise<Uint8Array | null> {
    const res = await this.fetchFn(`${this.baseUrl}/${QUICKNET_HASH}/public/${round}`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`drand answered ${res.status}`);
    const body = (await res.json()) as { round?: number; signature?: string };
    if (BigInt(body.round ?? -1) !== round || typeof body.signature !== 'string') throw new Error('drand answered another round');
    return verifyAndDecompress(round, body.signature);
  }
}

/** Checks a compressed quicknet signature of `round` and returns its uncompressed G1 encoding. */
export async function verifyAndDecompress(round: bigint, compressedHex: string): Promise<Uint8Array> {
  const bls = bls12_381.shortSignatures;
  const point = bls12_381.G1.Point.fromHex(compressedHex);
  const ok = bls.verify(compressedHex, bls.hash(await message(round)), QUICKNET_PUBLIC_KEY);
  if (!ok) throw new Error(`invalid drand signature for round ${round}`);
  return point.toBytes(false);
}

