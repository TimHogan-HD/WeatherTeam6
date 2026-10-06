CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_key_attempted_idx" ON "login_attempts" USING btree ("key_hash","attempted_at");--> statement-breakpoint
CREATE INDEX "login_attempts_attempted_idx" ON "login_attempts" USING btree ("attempted_at");