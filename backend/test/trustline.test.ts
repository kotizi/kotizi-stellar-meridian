import { describe, expect, it } from 'vitest';
import { StellarTxError, holdingFrom, isMissingTrustline } from '../src/stellar/errors.js';
import { bearer, harness, type Harness } from './app-helper.js';
import { group, newKey } from './fake-chain.js';
import { afterEach, beforeEach } from 'vitest';

// What the Soroban RPC really answers for the balance of an account without a trustline to a SAC token
// (captured from testnet).
const REAL = new StellarTxError(
  'HostError: Error(Contract, #13)\n\nEvent log (newest first):\n   0: [Diagnostic Event] contract:CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA, topics:[error, Error(Contract, #13)], data:["trustline entry is missing for account", GBG2Y3PQC4HI4WGFJPRIOLN7DF7PVEFXKTCQV3SZ7CB4E3JZGUDGCIRP]',
);

describe('missing trustline', () => {
  it('is recognised from the real RPC answer, and only that', () => {
    expect(isMissingTrustline(REAL)).toBe(true);
    expect(isMissingTrustline(new StellarTxError('HostError: Error(Contract, #12)'))).toBe(false);
    expect(isMissingTrustline(new Error('trustline entry is missing'))).toBe(false); // not a chain error
  });

  it('reads as a zero balance without a trustline, while other failures still surface', async () => {
    expect(await holdingFrom(async () => 5n)).toEqual({ balance: 5n, trustline: true });
    expect(await holdingFrom(async () => 0n)).toEqual({ balance: 0n, trustline: true }); // zero is not "no trustline"
    expect(await holdingFrom(async () => { throw REAL; })).toEqual({ balance: 0n, trustline: false });
    await expect(holdingFrom(async () => { throw new StellarTxError('HostError: Error(Contract, #3)'); })).rejects.toBeInstanceOf(StellarTxError);
    await expect(holdingFrom(async () => { throw new TypeError('boom'); })).rejects.toThrow('boom');
  });
});

describe('paying without a trustline', () => {
  let h: Harness;
  const user = newKey().publicKey();
  beforeEach(async () => {
    h = await harness();
    h.chain.accounts.add(user);
    h.chain.groupList = [group()];
    h.chain.owners.set(0, [user]);
  });
  afterEach(() => h.close());

  it('answers 422 missing_trustline instead of a raw simulation error', async () => {
    h.chain.failSimulationWith = REAL.message;
    const res = await h.app.inject({ method: 'POST', url: '/v1/tx/prepare', headers: bearer(user), payload: { fn: 'pay_quota', groupId: 0, index: 0 } });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'missing_trustline' });
  });
});
