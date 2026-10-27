CREATE TYPE "public"."sun_exposure" AS ENUM('full_sun', 'mostly_sun', 'mixed', 'mostly_shade', 'full_shade');--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "area_id" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "area_name" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "wall" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "observed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "sun_exposure" "sun_exposure";--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_span_is_forward" CHECK ("feedback"."observed_until" IS NULL OR ("feedback"."observed_at" IS NOT NULL AND "feedback"."observed_until" >= "feedback"."observed_at"));