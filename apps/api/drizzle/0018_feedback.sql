CREATE TYPE "public"."feedback_kind" AS ENUM('app', 'forecast');--> statement-breakpoint
CREATE TYPE "public"."forecast_verdict" AS ENUM('matched', 'partly', 'missed');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "feedback_kind" NOT NULL,
	"location_id" uuid,
	"location_name" text,
	"lat" double precision,
	"lon" double precision,
	"message" text,
	"observed_at" timestamp with time zone,
	"observed_conditions" "overall_status",
	"verdict" "forecast_verdict",
	"app_readings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_app_has_message" CHECK ("feedback"."kind" <> 'app' OR ("feedback"."message" IS NOT NULL AND length(btrim("feedback"."message")) > 0)),
	CONSTRAINT "feedback_forecast_is_complete" CHECK ("feedback"."kind" <> 'forecast' OR ("feedback"."observed_at" IS NOT NULL AND "feedback"."observed_conditions" IS NOT NULL AND "feedback"."verdict" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_user_created_idx" ON "feedback" USING btree ("user_id","created_at");