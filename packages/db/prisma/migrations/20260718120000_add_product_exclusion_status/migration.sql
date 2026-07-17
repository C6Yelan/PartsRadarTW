CREATE TYPE "ProductExclusionReason" AS ENUM (
  'misclassified_bundle_product',
  'conditional_add_on'
);

ALTER TABLE "products"
ADD COLUMN "is_excluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "exclusion_reason" "ProductExclusionReason";

CREATE INDEX "products_is_excluded_idx"
ON "products"("is_excluded");

UPDATE "products"
SET
  "is_active" = true,
  "is_excluded" = true,
  "exclusion_reason" = 'misclassified_bundle_product',
  "missing_since" = NULL,
  "missing_seen_count" = 0
WHERE "id" = '2c53ba90-eb9e-4f47-b57a-65a8fce10330'::uuid;
