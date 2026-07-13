ALTER TABLE "products"
ADD COLUMN "image_cache_last_error_kind" TEXT,
ADD COLUMN "image_cache_last_http_status" INTEGER,
ADD COLUMN "image_cache_failure_since" TIMESTAMPTZ(6),
ADD COLUMN "image_cache_last_success_at" TIMESTAMPTZ(6);

ALTER TABLE "parse_errors"
ADD COLUMN "fingerprint" VARCHAR(64),
ADD COLUMN "occurrence_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "last_seen_at" TIMESTAMPTZ(6);

UPDATE "parse_errors"
SET "last_seen_at" = "created_at";

ALTER TABLE "parse_errors"
ALTER COLUMN "last_seen_at" SET NOT NULL,
ALTER COLUMN "last_seen_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "parse_errors_fingerprint_key" ON "parse_errors"("fingerprint");
CREATE INDEX "parse_errors_error_type_last_seen_at_idx"
ON "parse_errors"("error_type", "last_seen_at");
