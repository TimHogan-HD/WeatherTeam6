CREATE TABLE "radar_rain_hours" (
	"cell_key" text NOT NULL,
	"valid_at" timestamp with time zone NOT NULL,
	"precip_mm" double precision,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radar_rain_hours_cell_key_valid_at_pk" PRIMARY KEY("cell_key","valid_at")
);
