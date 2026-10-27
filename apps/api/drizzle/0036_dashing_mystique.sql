ALTER TABLE "feedback" DROP CONSTRAINT "feedback_span_is_forward";--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "area_id";--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "area_name";--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "wall";--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "observed_until";--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "sun_exposure";--> statement-breakpoint
DROP TYPE "public"."sun_exposure";