ALTER TABLE "forecast_snapshots" ADD COLUMN "dewpoint_c" numeric;--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD COLUMN "shortwave_wm2" numeric;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "elevation_m" numeric;