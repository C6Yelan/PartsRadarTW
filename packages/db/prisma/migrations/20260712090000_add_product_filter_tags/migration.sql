ALTER TABLE "products"
ADD COLUMN "filter_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "products_filter_tags_idx"
ON "products" USING GIN ("filter_tags");
