CREATE TABLE "trip_rain_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"mean_mm" double precision,
	"p10_mm" double precision,
	"p90_mm" double precision,
	"member_count" integer,
	"days_covered" integer,
	"trip_days" integer NOT NULL,
	"high_c_max" double precision,
	CONSTRAINT "trip_rain_records_trip_location_hour" UNIQUE("trip_id","location_id","recorded_at")
);
--> statement-breakpoint
ALTER TABLE "trip_rain_records" ADD CONSTRAINT "trip_rain_records_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_rain_records" ADD CONSTRAINT "trip_rain_records_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;