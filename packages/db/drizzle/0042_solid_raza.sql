ALTER TABLE "user" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "user_external_id_idx" ON "user" USING btree ("external_id") WHERE external_id IS NOT NULL;