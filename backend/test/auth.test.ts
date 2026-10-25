import { describe, expect, it } from 'vitest';
import { DevAuthenticator } from '../src/auth/dev.js';
import { AuthError } from '../src/auth/index.js';
import { PrivyAuthenticator, stellarWalletsOf, type PrivyDirectory } from '../src/auth/privy.js';
import { loadConfig } from '../src/config.js';

describe('Privy linked accounts', () => {
  it('keeps only Stellar wallets, embedded or external', () => {
    expect(
      stellarWalletsOf([
        { type: 'email', address: 'a@b.c' },
        { type: 'wallet', chain_type: 'ethereum', address: '0xabc' },
        { type: 'wallet', chain_type: 'solana', address: 'SolanaWallet11111111111111111111111111111111' },
        { type: 'wallet', chain_type: 'stellar', address: 'GEMBEDDED1111111111111111111111111111111111111111111111' },
        { type: 'wallet', chain_type: 'stellar', address: 'GEXTERNAL1111111111111111111111111111111111111111111111' },
        { type: 'wallet', chain_type: 'stellar' },
      ]),
    ).toEqual([
      'GEMBEDDED1111111111111111111111111111111111111111111111',
      'GEXTERNAL1111111111111111111111111111111111111111111111',
    ]);
  });
});

describe('dev authenticator', () => {
  it('trusts dev tokens and nothing else', async () => {
    const auth = new DevAuthenticator();
    expect(await auth.authenticate('dev:AAA,BBB')).toEqual({ userId: 'dev-AAA', wallets: ['AAA', 'BBB'] });
    await expect(auth.authenticate('eyJhbGciOi.real.jwt')).rejects.toBeInstanceOf(AuthError);
    await expect(auth.authenticate('dev:')).rejects.toBeInstanceOf(AuthError);
  });
});

describe('config', () => {
  const base = { CONTRACT_ID: `C${'A'.repeat(55)}`, SPONSOR_KEYFILE: 'sponsor.key' };
  it('refuses dev auth in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', AUTH_MODE: 'dev' })).toThrow(/production/);
  });
  it('requires Privy credentials unless in dev auth', () => {
    expect(() => loadConfig({ ...base })).toThrow(/PRIVY_APP_ID/);
    expect(loadConfig({ ...base, PRIVY_APP_ID: 'a', PRIVY_APP_SECRET: 'b' }).AUTH_MODE).toBe('privy');
    expect(loadConfig({ ...base, AUTH_MODE: 'dev' }).AUTH_MODE).toBe('dev');
  });
  it('serves Stellar testnet only', () => {
    const dev = { ...base, AUTH_MODE: 'dev' };
    expect(() => loadConfig({ ...dev, NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015' })).toThrow(/testnet/);
    expect(() => loadConfig({ AUTH_MODE: 'dev', SPONSOR_KEYFILE: 'k' })).toThrow(); // no contract id
    expect(() => loadConfig({ ...dev, CONTRACT_ID: 'GABC' })).toThrow(/CONTRACT_ID/);
  });
  it('needs a key file for each server-side feature it enables', () => {
    const dev = { ...base, AUTH_MODE: 'dev' };
    expect(() => loadConfig({ ...dev, KYC_MODE: 'auto' })).toThrow(/KYC_KEYFILE/);
    expect(() => loadConfig({ ...dev, FAUCET_ENABLED: 'true' })).toThrow(/MINT_KEYFILE/);
  });
});

describe('Privy authenticator wallet cache', () => {
  const fake = (wallets: () => string[]) => {
    let calls = 0;
    const directory: PrivyDirectory = {
      verify: async (t) => {
        if (t !== 'good') throw new Error('bad');
        return 'did:privy:u1';
      },
      wallets: async () => {
        calls++;
        return wallets();
      },
    };
    return { directory, calls: () => calls };
  };

  it('never caches a user with no wallet yet, so a new embedded wallet shows up on the next call', async () => {
    let list: string[] = [];
    const f = fake(() => list);
    const auth = new PrivyAuthenticator(f.directory);
    expect((await auth.authenticate('good')).wallets).toEqual([]);
    list = ['NewEmbeddedWallet1111111111111111111111111111'];
    expect((await auth.authenticate('good')).wallets).toEqual(list);
    expect(f.calls()).toBe(2);
  });

  it('caches wallets for 30 seconds', async () => {
    let t = 0;
    const f = fake(() => ['W1']);
    const auth = new PrivyAuthenticator(f.directory, () => t);
    await auth.authenticate('good');
    t = 29_000;
    await auth.authenticate('good');
    expect(f.calls()).toBe(1);
    t = 31_000;
    await auth.authenticate('good');
    expect(f.calls()).toBe(2);
  });

  it('rejects a token Privy does not verify', async () => {
    const auth = new PrivyAuthenticator(fake(() => ['W1']).directory);
    await expect(auth.authenticate('bad')).rejects.toBeInstanceOf(AuthError);
  });
});
