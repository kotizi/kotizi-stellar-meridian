import { bigint, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/** One row per transaction the relay (or keeper) paid for; drives the rate limits. */
export const sponsoredTx = pgTable(
  'sponsored_tx',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    wallet: text('wallet').notNull(),
    txHash: text('tx_hash').notNull().unique(),
    kinds: text('kinds').notNull(),
    estStroops: bigint('est_stroops', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('sponsored_tx_user_created').on(t.userId, t.createdAt)],
);

export const kycApprovals = pgTable('kyc_approvals', {
  wallet: text('wallet').primaryKey(),
  userId: text('user_id').notNull(),
  txHash: text('tx_hash').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const faucetClaims = pgTable(
  'faucet_claims',
  {
    id: serial('id').primaryKey(),
    wallet: text('wallet').notNull(),
    userId: text('user_id').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    txHash: text('tx_hash').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('faucet_claims_wallet_created').on(t.wallet, t.createdAt)],
);

/**
 * Secrets of the draws the keeper has committed to (`request_draw`), kept until `settle_draw` reveals them.
 * Stored in clear for the testnet demo: whoever reads this table can predict the winner of a pending draw.
 */
export const drawSecrets = pgTable(
  'draw_secrets',
  {
    commitment: text('commitment').primaryKey(),
    groupId: integer('group_id').notNull(),
    secret: text('secret').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('draw_secrets_group').on(t.groupId)],
);
