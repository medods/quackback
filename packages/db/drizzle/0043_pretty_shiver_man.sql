ALTER TABLE "posts" drop column "search_vector";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('russian', coalesce(title, '')), 'A') || setweight(to_tsvector('russian', coalesce(content, '')), 'B') || setweight(to_tsvector('english', coalesce(title, '')), 'C') || setweight(to_tsvector('english', coalesce(content, '')), 'D')) STORED;
--> statement-breakpoint
CREATE INDEX "posts_search_vector_idx" ON "posts" USING gin ("search_vector");
