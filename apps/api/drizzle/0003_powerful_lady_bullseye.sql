CREATE TABLE "walls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"aspect_deg" integer NOT NULL,
	"aspect_source" text NOT NULL,
	"angle_deg" integer NOT NULL,
	"angle_band" text NOT NULL,
	"route_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "walls" ADD CONSTRAINT "walls_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walls" ADD CONSTRAINT "walls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;