import { describe, expect, it } from 'vitest';
import { DrandBeacons, GENESIS, QUICKNET_HASH, roundTime, verifyAndDecompress } from '../src/drand.js';

// Real quicknet beacon of round 1000000, and its uncompressed form: the very bytes the contract's tests
// (contract/kotizi/src/test_beacons.rs) verify on-chain.
const SIG = '83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72';
const UNCOMPRESSED = '03ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe7201776ff7408b39c5f6f9fa50746efd7eea17fbb61f2e7b9c849ff0528e5a3deeedd029d0df345199963d75ba93b5a02a';

describe('drand', () => {
  it('knows when a round is published', () => {
    expect(roundTime(1n)).toBe(GENESIS);
    expect(roundTime(1_000_000n)).toBe(GENESIS + 2_999_997n);
  });

  it('verifies a real beacon and decompresses it exactly as the contract expects', async () => {
    const out = await verifyAndDecompress(1_000_000n, SIG);
    expect(Buffer.from(out).toString('hex')).toBe(UNCOMPRESSED);
    expect(out).toHaveLength(96);
  });

  it('rejects a signature of another round and a forged one', async () => {
    await expect(verifyAndDecompress(1_000_001n, SIG)).rejects.toThrow('invalid drand signature');
    const forged = SIG.slice(0, -2) + (SIG.endsWith('00') ? '01' : '00');
    await expect(verifyAndDecompress(1_000_000n, forged)).rejects.toThrow();
  });

  it('fetches from the relay, treats 404 as not published and never trusts a wrong answer', async () => {
    const ok = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
    const urls: string[] = [];
    const record = (f: () => Promise<Response>) => async (url: string | URL | Request) => (urls.push(String(url)), f());

    const good = new DrandBeacons('https://relay.test', record(ok({ round: 1_000_000, signature: SIG })) as typeof fetch);
    expect(Buffer.from((await good.signature(1_000_000n))!).toString('hex')).toBe(UNCOMPRESSED);
    expect(urls[0]).toBe(`https://relay.test/${QUICKNET_HASH}/public/1000000`);

    expect(await new DrandBeacons('https://relay.test', ok({}, 404) as typeof fetch).signature(5n)).toBeNull();
    await expect(new DrandBeacons('https://relay.test', ok({}, 500) as typeof fetch).signature(5n)).rejects.toThrow('500');
    // the relay answers another round than asked
    await expect(new DrandBeacons('https://relay.test', ok({ round: 7, signature: SIG }) as typeof fetch).signature(1_000_000n)).rejects.toThrow('another round');
    // right round number, signature that is not the round's
    await expect(new DrandBeacons('https://relay.test', ok({ round: 1_000_001, signature: SIG }) as typeof fetch).signature(1_000_001n)).rejects.toThrow('invalid');
  });
});
