CREATE TABLE "weather_ensemble_hours" (
	"run_id" uuid NOT NULL,
	"valid_at" timestamp with time zone NOT NULL,
	"precip_mm_p10" double precision,
	"precip_mm_p50" double precision,
	"precip_mm_p90" double precision,
	"temp_c_p10" double precision,
	"temp_c_p50" double precision,
	"temp_c_p90" double precision,
	"wind_kmh_p10" double precision,
	"wind_kmh_p50" double precision,
	"wind_kmh_p90" double precision,
	"member_count" integer NOT NULL,
	"model_member_counts" jsonb NOT NULL,
	CONSTRAINT "weather_ensemble_hours_run_id_valid_at_pk" PRIMARY KEY("run_id","valid_at")
);
--> statement-breakpoint
CREATE TABLE "weather_run_hours" (
	"run_id" uuid NOT NULL,
	"valid_at" timestamp with time zone NOT NULL,
	"temp_c" double precision,
	"dewpoint_c" double precision,
	"humidity_pct" double precision,
	"precip_mm" double precision,
	"wind_kmh" double precision,
	"wind_gust_kmh" double precision,
	"wind_dir_deg" double precision,
	"cloud_pct" double precision,
	"precip_prob_pct" double precision,
	"pressure_hpa" double precision,
	CONSTRAINT "weather_run_hours_run_id_valid_at_pk" PRIMARY KEY("run_id","valid_at")
);
--> statement-breakpoint
CREATE TABLE "weather_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"point_key" text NOT NULL,
	"location_id" uuid,
	"model" text NOT NULL,
	"kind" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"utc_offset_seconds" integer NOT NULL,
	"model_elevation_m" double precision,
	"precip_prob_is_shared" boolean,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_runs_point_model_fetch" UNIQUE("point_key","model","fetched_at")
);
--> statement-breakpoint
ALTER TABLE "weather_ensemble_hours" ADD CONSTRAINT "weather_ensemble_hours_run_id_weather_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."weather_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_run_hours" ADD CONSTRAINT "weather_run_hours_run_id_weather_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."weather_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_runs" ADD CONSTRAINT "weather_runs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weather_runs_point_fetched_at_idx" ON "weather_runs" USING btree ("point_key","fetched_at");--> statement-breakpoint
CREATE INDEX "weather_runs_fetched_at_idx" ON "weather_runs" USING btree ("fetched_at");