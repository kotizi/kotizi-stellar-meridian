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
