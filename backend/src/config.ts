import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

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
  KEEPER_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),

  METADATA_IMAGE_URL: z.string().default('https://example.com/kotizi/cota.png'),

  // Stellar testnet only: any other passphrase is refused at start-up.
  STELLAR_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  /** The deployed Kotizi contract (C...). */
  CONTRACT_ID: z.string().regex(/^C[A-Z2-7]{55}$/, 'CONTRACT_ID must be a Stellar contract address (C...)'),

  // Files holding a secret seed (S...), outside git. One file may serve several roles. Never logged.
  /** Source and fee payer of relayed transactions; also pays account activation. */
  SPONSOR_KEYFILE: z.string(),
  /** Signs the draw commits and reveals and pays their fee. Defaults to the sponsor key. */
  KEEPER_KEYFILE: z.string().optional(),
  /** Must be the contract's kyc_authority. Needed when KYC_MODE=auto. */
  KYC_KEYFILE: z.string().optional(),
  /** Must be the admin of the test token. Needed when FAUCET_ENABLED. */
  MINT_KEYFILE: z.string().optional(),
  /** XLM an activated account is created with (the base reserve is 1 XLM). */
  ACCOUNT_ACTIVATION_XLM: z.string().regex(/^\d+(\.\d{1,7})?$/).default('2'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cfg = schema.parse(env);
  if (cfg.AUTH_MODE === 'dev' && cfg.NODE_ENV === 'production') {
    throw new Error('AUTH_MODE=dev is not allowed when NODE_ENV=production');
  }
  if (cfg.AUTH_MODE === 'privy' && (!cfg.PRIVY_APP_ID || !cfg.PRIVY_APP_SECRET)) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET are required when AUTH_MODE=privy');
  }
  if (cfg.NETWORK_PASSPHRASE !== 'Test SDF Network ; September 2015') {
    throw new Error('Only Stellar testnet is supported (NETWORK_PASSPHRASE)');
  }
  if (cfg.KYC_MODE === 'auto' && !cfg.KYC_KEYFILE) throw new Error('KYC_MODE=auto needs KYC_KEYFILE');
  if (cfg.FAUCET_ENABLED && !cfg.MINT_KEYFILE) throw new Error('FAUCET_ENABLED needs MINT_KEYFILE');
  return cfg;
}
