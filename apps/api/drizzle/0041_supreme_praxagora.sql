CREATE TABLE "trip_day_volunteer_gauges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station" text NOT NULL,
	"station_name" text NOT NULL,
	"report_date" date NOT NULL,
	"obs_hour" integer,
	"recorded_at" timestamp with time zone NOT NULL,
	"rain_mm" double precision NOT NULL,
	CONSTRAINT "trip_day_volunteer_gauges_station_report" UNIQUE("station","report_date")
);
