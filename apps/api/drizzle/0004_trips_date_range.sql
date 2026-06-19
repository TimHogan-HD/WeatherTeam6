ALTER TABLE "trips" ADD COLUMN "start_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "end_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN "target_date";
