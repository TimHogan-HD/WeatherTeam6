CREATE TABLE "sensor_readings" (
	"device" text NOT NULL,
	"sku" text NOT NULL,
	"device_name" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"temp_c" double precision,
	"humidity_pct" double precision,
	CONSTRAINT "sensor_readings_device_recorded_at_pk" PRIMARY KEY("device","recorded_at")
);
