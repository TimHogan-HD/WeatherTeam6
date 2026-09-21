ALTER TABLE "user_preferences" ADD COLUMN "ideal_temp_min_c" double precision DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ideal_temp_max_c" double precision DEFAULT 22 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "drying_caution" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "include_sun" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "window_min_rock" text DEFAULT 'drying' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "window_min_friction" text DEFAULT 'fair' NOT NULL;--> statement-breakpoint
ALTER TABLE "weather_run_hours" ADD COLUMN "shortwave_wm2" double precision;