CREATE UNIQUE INDEX "coverage_occurrence" ON "coverage" USING btree (("data"->>'occurrenceId'));--> statement-breakpoint
CREATE UNIQUE INDEX "generation_idempotency" ON "jobs" USING btree (("data"->>'key'));--> statement-breakpoint
CREATE UNIQUE INDEX "member_email" ON "members" USING btree (lower("data"->>'email'));--> statement-breakpoint
CREATE UNIQUE INDEX "member_identity" ON "members" USING btree (("data"->>'authId'));--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_offer" ON "offers" USING btree (("data"->>'coverageId')) WHERE "offers"."data"->>'status' = 'pending';