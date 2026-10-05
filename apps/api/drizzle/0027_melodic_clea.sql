CREATE TABLE "trip_day_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"score" integer,
	"dryness" text,
	"rain_mm" double precision,
	"temp_c_max" double precision,
	"temp_c_min" double precision,
	CONSTRAINT "trip_day_outcomes_location_day" UNIQUE("location_id","local_date")
);
--> statement-breakpoint
ALTER TABLE "trip_day_outcomes" ADD CONSTRAINT "trip_day_outcomes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;