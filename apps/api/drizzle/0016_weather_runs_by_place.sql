ALTER TABLE "weather_runs" DROP CONSTRAINT "weather_runs_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "weather_runs" DROP COLUMN "location_id";