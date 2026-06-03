CREATE TABLE "weather_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"nws_alert_id" text NOT NULL,
	"event" text NOT NULL,
	"severity" text NOT NULL,
	"certainty" text NOT NULL,
	"headline" text,
	"description" text,
	"effective" timestamp with time zone,
	"expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_alerts_location_id_nws_alert_id_unique" UNIQUE("location_id","nws_alert_id")
);
--> statement-breakpoint
ALTER TABLE "weather_alerts" ADD CONSTRAINT "weather_alerts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
