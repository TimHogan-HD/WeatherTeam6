ALTER TABLE "trips" ADD COLUMN "climb_first_hour" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "climb_last_hour" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_climb_hours_paired" CHECK (("trips"."climb_first_hour" IS NULL) = ("trips"."climb_last_hour" IS NULL));