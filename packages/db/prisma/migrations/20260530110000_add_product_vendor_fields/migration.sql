-- AlterTable
ALTER TABLE "products"
ADD COLUMN "vendor_slug" TEXT,
ADD COLUMN "vendor_name" TEXT;

-- CreateIndex
CREATE INDEX "products_source_category_id_vendor_slug_idx" ON "products"("source_category_id", "vendor_slug");

-- UpdateView
DROP VIEW IF EXISTS "product_list_view";

CREATE VIEW "product_list_view" AS
SELECT
    "products"."id" AS "product_id",
    "products"."name" AS "product_name",
    "products"."normalized_name",
    "products"."vendor_slug",
    "products"."vendor_name",
    "products"."primary_image_url",
    "products"."primary_image_checked_at",
    "source_categories"."display_name" AS "category_display_name",
    "source_categories"."source_name",
    "source_categories"."igrp",
    "price_snapshots"."price" AS "current_price",
    "price_snapshots"."currency",
    "price_snapshots"."captured_at" AS "price_captured_at",
    "current_prices"."last_seen_at",
    "products"."is_active",
    "products"."source_url"
FROM "products"
INNER JOIN "source_categories"
    ON "source_categories"."id" = "products"."source_category_id"
INNER JOIN "current_prices"
    ON "current_prices"."product_id" = "products"."id"
INNER JOIN "price_snapshots"
    ON "price_snapshots"."id" = "current_prices"."price_snapshot_id"
    AND "price_snapshots"."product_id" = "products"."id";
