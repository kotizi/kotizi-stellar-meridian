import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { DevAuthenticator } from '../src/auth/dev.js';
import { AuthError } from '../src/auth/index.js';
import { PrivyAuthenticator, stellarWalletsOf, type PrivyDirectory } from '../src/auth/privy.js';
import { loadConfig } from '../src/config.js';
import { loadKeys } from '../src/stellar/keys.js';

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

describe('config: empty variables and production', () => {
  const base = { CONTRACT_ID: `C${'A'.repeat(55)}`, SPONSOR_SECRET: Keypair.random().secret(), AUTH_MODE: 'dev' };
  it('treats an empty variable as unset, so its default applies', () => {
    const cfg = loadConfig({ ...base, CORS_ORIGINS: '', PUBLIC_URL: '', DATABASE_URL: '', KEEPER_INTERVAL_MS: '' });
    expect(cfg.CORS_ORIGINS).toBe('http://localhost:3000');
    expect(cfg.PUBLIC_URL).toBe('http://localhost:3001');
    expect(cfg.DATABASE_URL).toBeUndefined();
    expect(cfg.KEEPER_INTERVAL_MS).toBe(5000);
  });
  it('an empty Privy credential still fails clearly', () => {
    expect(() => loadConfig({ ...base, AUTH_MODE: 'privy', PRIVY_APP_ID: '', PRIVY_APP_SECRET: '' })).toThrow(/PRIVY_APP_ID/);
  });
  it('requires a real database in production instead of falling back to the embedded one', () => {
    const prod = { ...base, AUTH_MODE: 'privy', NODE_ENV: 'production', PRIVY_APP_ID: 'a', PRIVY_APP_SECRET: 'b' };
    expect(() => loadConfig(prod)).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...prod, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(loadConfig({ ...prod, DATABASE_URL: 'postgres://u:p@h:5432/d' }).DATABASE_URL).toBe('postgres://u:p@h:5432/d');
  });
});

describe('config: keys as secret environment variables', () => {
  const contract = `C${'A'.repeat(55)}`;
  const sponsor = Keypair.random();
  const base = { CONTRACT_ID: contract, AUTH_MODE: 'dev' };

  it('accepts a role key as a seed instead of a file, and one of the two is required for the sponsor', () => {
    expect(loadConfig({ ...base, SPONSOR_SECRET: sponsor.secret() }).SPONSOR_SECRET).toBe(sponsor.secret());
    expect(() => loadConfig({ ...base })).toThrow(/SPONSOR_KEYFILE or SPONSOR_SECRET/);
    expect(loadConfig({ ...base, SPONSOR_SECRET: sponsor.secret(), KYC_MODE: 'auto', KYC_SECRET: Keypair.random().secret() }).KYC_MODE).toBe('auto');
    expect(loadConfig({ ...base, SPONSOR_KEYFILE: 'k', FAUCET_ENABLED: 'true', FAUCET_TOKEN: contract, MINT_SECRET: Keypair.random().secret() }).FAUCET_ENABLED).toBe(true);
  });
  it('refuses a role given both ways, and the features still need their key', () => {
    expect(() => loadConfig({ ...base, SPONSOR_KEYFILE: 'k', SPONSOR_SECRET: sponsor.secret() })).toThrow(/only one of SPONSOR_KEYFILE and SPONSOR_SECRET/);
    expect(() => loadConfig({ ...base, SPONSOR_SECRET: sponsor.secret(), KYC_MODE: 'auto' })).toThrow(/KYC_KEYFILE or KYC_SECRET/);
    expect(() => loadConfig({ ...base, SPONSOR_SECRET: sponsor.secret(), FAUCET_ENABLED: 'true', FAUCET_TOKEN: contract })).toThrow(/MINT_KEYFILE or MINT_SECRET/);
  });
  it('rejects a malformed seed without ever echoing it', () => {
    const bad = `S${'1'.repeat(55)}`; // not base32, so not a seed
    let message = '';
    try {
      loadConfig({ ...base, SPONSOR_SECRET: bad });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/SPONSOR_SECRET/);
    expect(message).not.toContain(bad);
    // a public key is not a seed either
    expect(() => loadConfig({ ...base, SPONSOR_SECRET: sponsor.publicKey() })).toThrow();
  });
});

describe('loadKeys', () => {
  const [sponsor, keeper, kyc, mint] = [Keypair.random(), Keypair.random(), Keypair.random(), Keypair.random()];
  const dir = mkdtempSync(join(tmpdir(), 'kotizi-keys-'));
  const file = join(dir, 'k.key');
  writeFileSync(file, `${keeper.secret()}\n`);

  it('builds every role from seeds, with the keeper defaulting to the sponsor', () => {
    const keys = loadKeys({ SPONSOR_SECRET: sponsor.secret(), KYC_SECRET: kyc.secret(), MINT_SECRET: mint.secret(), FAUCET_ENABLED: true });
    expect(keys.sponsor.publicKey()).toBe(sponsor.publicKey());
    expect(keys.keeper.publicKey()).toBe(sponsor.publicKey());
    expect(keys.kycSigner?.publicKey()).toBe(kyc.publicKey());
    expect(keys.mintSigner?.publicKey()).toBe(mint.publicKey());
  });
  it('mixes files and seeds, and only loads the mint key when the faucet is on', () => {
    const keys = loadKeys({ SPONSOR_SECRET: sponsor.secret(), KEEPER_KEYFILE: file, MINT_SECRET: mint.secret(), FAUCET_ENABLED: false });
    expect(keys.keeper.publicKey()).toBe(keeper.publicKey());
    expect(keys.kycSigner).toBeUndefined();
    expect(keys.mintSigner).toBeUndefined();
  });
  it('fails clearly on an unreadable file, and its message does not contain a seed', () => {
    expect(() => loadKeys({ SPONSOR_KEYFILE: join(dir, 'missing.key'), FAUCET_ENABLED: false })).toThrow();
    writeFileSync(file, 'not a seed\n');
    let message = '';
    try {
      loadKeys({ SPONSOR_KEYFILE: file, FAUCET_ENABLED: false });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/valid Stellar secret seed/);
    expect(message).not.toContain('not a seed');
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
