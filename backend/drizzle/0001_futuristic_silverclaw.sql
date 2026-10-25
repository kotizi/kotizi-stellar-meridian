CREATE TABLE "draw_secrets" (
	"commitment" text PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "draw_secrets_group" ON "draw_secrets" USING btree ("group_id");