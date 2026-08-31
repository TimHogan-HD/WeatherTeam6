CREATE TABLE "panel_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid,
	"lat" numeric,
	"lon" numeric,
	"place_name" text,
	"view" text NOT NULL,
	"model" text,
	"interval_hours" integer,
	"day_offset" integer DEFAULT 0 NOT NULL,
	"column_set" text,
	"units" text DEFAULT 'imperial' NOT NULL,
	"mode" text DEFAULT 'simple' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "panel_states" ADD CONSTRAINT "panel_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_states" ADD CONSTRAINT "panel_states_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;