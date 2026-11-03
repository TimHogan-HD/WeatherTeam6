CREATE TABLE "trip_day_gauges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station" text NOT NULL,
	"local_date" date NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"rain_mm" double precision,
	"hours_reported" integer NOT NULL,
	"hours_expected" integer NOT NULL,
	CONSTRAINT "trip_day_gauges_station_day" UNIQUE("station","local_date")
);
