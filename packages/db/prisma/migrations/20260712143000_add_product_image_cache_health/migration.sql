ALTER TABLE "products"
ADD COLUMN "image_cached_at" TIMESTAMPTZ(6),
ADD COLUMN "image_cache_checked_at" TIMESTAMPTZ(6),
ADD COLUMN "image_cache_failure_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "image_cache_last_error" TEXT,
ADD COLUMN "image_cache_next_retry_at" TIMESTAMPTZ(6);

CREATE INDEX "products_image_cache_checked_at_idx"
ON "products"("image_cache_checked_at");

CREATE INDEX "products_image_cache_next_retry_at_idx"
ON "products"("image_cache_next_retry_at");
