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

  KEEPER_ENABLED: bool.default(false),
  KEEPER_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),

  METADATA_IMAGE_URL: z.string().default('https://example.com/kotizi/cota.png'),

  // TODO(stellar): RPC URL, network passphrase, contract id, sponsor/KYC/mint secret keys, fee budget (task 5).
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
  return cfg;
}
