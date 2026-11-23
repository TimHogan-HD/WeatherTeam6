ALTER TABLE "usage_events" ADD COLUMN "owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The one visit recorded before this column was the owner's own check after #646 deployed (2026-11-23).
UPDATE "usage_events" SET "owner" = true WHERE "visit_id" = '09b43dc2-9bf5-41d2-a532-311248fda2a5';
