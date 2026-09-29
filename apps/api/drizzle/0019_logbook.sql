CREATE TYPE "public"."tick_style" AS ENUM('send', 'flash', 'onsight', 'attempt');--> statement-breakpoint
CREATE TABLE "area_locations" (
	"area_id" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"accuracy_m" double precision NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"route_id" text NOT NULL,
	"ticked_on" date NOT NULL,
	"style" "tick_style" NOT NULL,
	"laps" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_todos" (
	"user_id" uuid NOT NULL,
	"route_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_todos_user_id_route_id_pk" PRIMARY KEY("user_id","route_id")
);
--> statement-breakpoint
ALTER TABLE "area_locations" ADD CONSTRAINT "area_locations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_ticks" ADD CONSTRAINT "route_ticks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_todos" ADD CONSTRAINT "route_todos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_locations_recorded_by_idx" ON "area_locations" USING btree ("recorded_by");--> statement-breakpoint
CREATE INDEX "route_ticks_user_route_idx" ON "route_ticks" USING btree ("user_id","route_id");