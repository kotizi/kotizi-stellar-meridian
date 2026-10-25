CREATE TABLE "faucet_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_approvals" (
	"wallet" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsored_tx" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet" text NOT NULL,
	"tx_hash" text NOT NULL,
	"kinds" text NOT NULL,
	"est_stroops" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sponsored_tx_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE INDEX "faucet_claims_wallet_created" ON "faucet_claims" USING btree ("wallet","created_at");--> statement-breakpoint
CREATE INDEX "sponsored_tx_user_created" ON "sponsored_tx" USING btree ("user_id","created_at");