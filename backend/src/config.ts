import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

/** A Stellar secret seed. The message deliberately never echoes the value. */
const seed = z.string().regex(/^S[A-Z2-7]{55}$/, 'must be a Stellar secret seed (S...)').optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3001),
  PUBLIC_URL: z.string().default('http://localhost:3001'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  AUTH_MODE: z.enum(['privy', 'dev']).default('privy'),
  PRIVY_APP_ID: z.string().optional(),
  PRIVY_APP_SECRET: z.string().optional(),

  KYC_MODE: z.enum(['off', 'auto']).default('off'),
  FAUCET_ENABLED: bool.default(false),
  /** The test token (C...) the faucet mints; MINT_KEYFILE must be its admin. Real tokens (USDC, USDT0) are never minted. */
  FAUCET_TOKEN: z.string().regex(/^C[A-Z2-7]{55}$/).optional(),
  FAUCET_AMOUNT_USDC: z.coerce.number().positive().default(1000),

  // Postgres in production; embedded PGlite when unset.
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('.pglite'),

  RELAY_USER_DAILY_TX: z.coerce.number().int().positive().default(100),
  /** Most the sponsor pays for one relayed transaction (stroops; 1 XLM = 10_000_000). */
  RELAY_MAX_FEE_STROOPS: z.coerce.number().int().positive().default(10_000_000),
  RELAY_GLOBAL_DAILY_STROOPS: z.coerce.number().int().positive().default(1_000_000_000),
  /** The sponsor must keep at least this much after a transaction. */
  RELAY_MIN_SPONSOR_STROOPS: z.coerce.number().int().nonnegative().default(100_000_000),
  /** How long an authorization signature stays valid, in ledgers (~5 s each). */
  RELAY_AUTH_LEDGERS: z.coerce.number().int().positive().default(120),

  KEEPER_ENABLED: bool.default(false),
  /** drand HTTP relay serving the quicknet chain (verified locally, so the relay is not trusted). */
  DRAND_URL: z.string().url().default('https://api.drand.sh'),
  KEEPER_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  /** How often the keeper checks that the contract's entries will not expire (6 h). */
  KEEPER_MAINTENANCE_INTERVAL_MS: z.coerce.number().int().positive().default(21_600_000),
  /** Entries are extended to live this many ledgers (~5 s each); must stay below the network maximum (3,110,400 on testnet). */
  TTL_EXTEND_TO_LEDGERS: z.coerce.number().int().positive().default(3_000_000),

  METADATA_IMAGE_URL: z.string().default('https://example.com/kotizi/cota.png'),

  // Stellar testnet only: any other passphrase is refused at start-up.
  STELLAR_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  /** The deployed Kotizi contract (C...). */
  CONTRACT_ID: z.string().regex(/^C[A-Z2-7]{55}$/, 'CONTRACT_ID must be a Stellar contract address (C...)'),

  // Each role's key is a secret seed (S...), given either as a file outside git (*_KEYFILE) or as a secret
  // environment variable (*_SECRET, for hosts without files such as Railway); never both for one role. One key
  // may serve several roles. Seeds are never logged.
  /** Source and fee payer of relayed transactions; also pays account activation. Required. */
  SPONSOR_KEYFILE: z.string().optional(),
  SPONSOR_SECRET: seed,
  /** Signs request_draw / settle_draw and pays their fee. Defaults to the sponsor key. */
  KEEPER_KEYFILE: z.string().optional(),
  KEEPER_SECRET: seed,
  /** Must be the contract's kyc_authority. Needed when KYC_MODE=auto. */
  KYC_KEYFILE: z.string().optional(),
  KYC_SECRET: seed,
  /** Must be the admin of FAUCET_TOKEN. Needed when FAUCET_ENABLED. */
  MINT_KEYFILE: z.string().optional(),
  MINT_SECRET: seed,
  /** XLM an activated account is created with (the base reserve is 1 XLM). */
  ACCOUNT_ACTIVATION_XLM: z.string().regex(/^\d+(\.\d{1,7})?$/).default('2'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // A variable left empty (a placeholder pasted into a host's settings) counts as unset, so its default applies.
  const cfg = schema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (cfg.AUTH_MODE === 'dev' && cfg.NODE_ENV === 'production') {
    throw new Error('AUTH_MODE=dev is not allowed when NODE_ENV=production');
  }
  if (cfg.NODE_ENV === 'production' && !cfg.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production (the embedded database is not persistent on most hosts)');
  }
  if (cfg.AUTH_MODE === 'privy' && (!cfg.PRIVY_APP_ID || !cfg.PRIVY_APP_SECRET)) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET are required when AUTH_MODE=privy');
  }
  if (cfg.NETWORK_PASSPHRASE !== 'Test SDF Network ; September 2015') {
    throw new Error('Only Stellar testnet is supported (NETWORK_PASSPHRASE)');
  }
  for (const role of ['SPONSOR', 'KEEPER', 'KYC', 'MINT'] as const) {
    if (cfg[`${role}_KEYFILE`] && cfg[`${role}_SECRET`]) throw new Error(`Set only one of ${role}_KEYFILE and ${role}_SECRET`);
  }
  if (!cfg.SPONSOR_KEYFILE && !cfg.SPONSOR_SECRET) throw new Error('SPONSOR_KEYFILE or SPONSOR_SECRET is required');
  if (cfg.KYC_MODE === 'auto' && !cfg.KYC_KEYFILE && !cfg.KYC_SECRET) throw new Error('KYC_MODE=auto needs KYC_KEYFILE or KYC_SECRET');
  if (cfg.FAUCET_ENABLED && !cfg.MINT_KEYFILE && !cfg.MINT_SECRET) throw new Error('FAUCET_ENABLED needs MINT_KEYFILE or MINT_SECRET');
  if (cfg.FAUCET_ENABLED && !cfg.FAUCET_TOKEN) throw new Error('FAUCET_ENABLED needs FAUCET_TOKEN (the test token the mint key administers)');
  return cfg;
}
