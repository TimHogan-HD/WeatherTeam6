CREATE TABLE "trip_day_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"lead_days" integer NOT NULL,
	"scored_run_fetched_at" timestamp with time zone,
	"score" integer,
	"dryness" text,
	"friction" text,
	"temp_c_max" double precision,
	"temp_c_min" double precision,
	"members_wet" integer,
	"member_count" integer,
	"precip_mm_mean" double precision,
	CONSTRAINT "trip_day_records_location_day_hour" UNIQUE("location_id","local_date","recorded_at")
);
--> statement-breakpoint
ALTER TABLE "trip_day_records" ADD CONSTRAINT "trip_day_records_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;