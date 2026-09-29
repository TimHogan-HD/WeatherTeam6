ALTER TABLE "weather_run_hours" ADD COLUMN "rain_median_mm" double precision;--> statement-breakpoint
ALTER TABLE "weather_runs" ADD COLUMN "rain_models" text[];