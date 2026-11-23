ALTER TABLE "usage_events" DROP CONSTRAINT "usage_events_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "usage_events_user_created_idx";--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "visit_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_events_created_idx" ON "usage_events" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "user_id";