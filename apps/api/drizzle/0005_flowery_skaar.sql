CREATE TABLE "location_normals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"precip_normal_mm" numeric NOT NULL,
	"temp_max_normal_c" numeric NOT NULL,
	"temp_min_normal_c" numeric NOT NULL,
	"source" text DEFAULT 'acis_grid_91_20' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_normals_location_id_month_unique" UNIQUE("location_id","month")
);
--> statement-breakpoint
ALTER TABLE "location_normals" ADD CONSTRAINT "location_normals_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;