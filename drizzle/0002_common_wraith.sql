CREATE TABLE "repair_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_closures" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "repair_faculty_consent" ON "repair_consents" USING btree (("data"->>'planId'),("data"->>'facultyId'));--> statement-breakpoint
CREATE UNIQUE INDEX "repair_key" ON "repair_plans" USING btree (("data"->>'key'));