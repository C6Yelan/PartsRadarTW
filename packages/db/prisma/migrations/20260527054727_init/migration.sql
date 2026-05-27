-- CreateEnum
CREATE TYPE "currency" AS ENUM ('TWD');

-- CreateEnum
CREATE TYPE "crawl_run_status" AS ENUM ('running', 'success_changed', 'success_unchanged', 'success_with_errors', 'fetch_failed', 'suspected_block', 'parse_failed', 'skipped_overlap', 'backoff');

-- CreateEnum
CREATE TYPE "crawl_run_category_result_status" AS ENUM ('success_changed', 'success_unchanged', 'fetch_failed', 'suspected_block', 'parse_failed');

-- CreateEnum
CREATE TYPE "crawl_trigger_type" AS ENUM ('scheduled', 'manual');

-- CreateEnum
CREATE TYPE "raw_snapshot_content_status" AS ENUM ('valid', 'suspected_block', 'invalid');

-- CreateEnum
CREATE TYPE "parse_error_type" AS ENUM ('missing_ibuy_token', 'missing_name', 'price_parse_failed', 'duplicate_source_identity', 'content_validation_failed');

-- CreateTable
CREATE TABLE "source_categories" (
    "id" UUID NOT NULL,
    "igrp" INTEGER NOT NULL,
    "source_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_checked_at" TIMESTAMPTZ(6),
    "last_success_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "source_category_id" UUID NOT NULL,
    "ibuy_token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "missing_since" TIMESTAMPTZ(6),
    "missing_seen_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" "currency" NOT NULL DEFAULT 'TWD',
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "crawl_run_id" UUID NOT NULL,
    "raw_snapshot_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_prices" (
    "product_id" UUID NOT NULL,
    "price_snapshot_id" UUID NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "price_changed_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "current_prices_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "crawl_runs" (
    "id" UUID NOT NULL,
    "status" "crawl_run_status" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "trigger_type" "crawl_trigger_type" NOT NULL,
    "error_message" TEXT,
    "backoff_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_run_category_results" (
    "id" UUID NOT NULL,
    "crawl_run_id" UUID NOT NULL,
    "source_category_id" UUID NOT NULL,
    "status" "crawl_run_category_result_status" NOT NULL,
    "raw_snapshot_id" UUID,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_run_category_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_snapshots" (
    "id" UUID NOT NULL,
    "crawl_run_id" UUID NOT NULL,
    "source_category_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "http_status" INTEGER,
    "fetch_error" TEXT,
    "content_status" "raw_snapshot_content_status" NOT NULL,
    "content_hash" TEXT,
    "parsed_result_hash" TEXT,
    "compressed_html_path" TEXT,
    "duplicate_of_snapshot_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parse_errors" (
    "id" UUID NOT NULL,
    "crawl_run_id" UUID NOT NULL,
    "raw_snapshot_id" UUID,
    "source_category_id" UUID NOT NULL,
    "error_type" "parse_error_type" NOT NULL,
    "message" TEXT NOT NULL,
    "raw_name" TEXT,
    "raw_price_text" TEXT,
    "raw_token" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parse_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_categories_enabled_idx" ON "source_categories"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "source_categories_igrp_key" ON "source_categories"("igrp");

-- CreateIndex
CREATE INDEX "products_source_category_id_idx" ON "products"("source_category_id");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE INDEX "products_last_seen_at_idx" ON "products"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_source_category_id_ibuy_token_key" ON "products"("source_category_id", "ibuy_token");

-- CreateIndex
CREATE INDEX "price_snapshots_product_id_captured_at_idx" ON "price_snapshots"("product_id", "captured_at");

-- CreateIndex
CREATE INDEX "price_snapshots_crawl_run_id_idx" ON "price_snapshots"("crawl_run_id");

-- CreateIndex
CREATE INDEX "price_snapshots_raw_snapshot_id_idx" ON "price_snapshots"("raw_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_snapshots_id_product_id_key" ON "price_snapshots"("id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "current_prices_price_snapshot_id_key" ON "current_prices"("price_snapshot_id");

-- CreateIndex
CREATE INDEX "current_prices_last_seen_at_idx" ON "current_prices"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "current_prices_price_snapshot_id_product_id_key" ON "current_prices"("price_snapshot_id", "product_id");

-- CreateIndex
CREATE INDEX "crawl_runs_started_at_idx" ON "crawl_runs"("started_at");

-- CreateIndex
CREATE INDEX "crawl_runs_status_idx" ON "crawl_runs"("status");

-- CreateIndex
CREATE INDEX "crawl_runs_backoff_until_idx" ON "crawl_runs"("backoff_until");

-- CreateIndex
CREATE INDEX "crawl_run_category_results_crawl_run_id_idx" ON "crawl_run_category_results"("crawl_run_id");

-- CreateIndex
CREATE INDEX "crawl_run_category_results_source_category_id_idx" ON "crawl_run_category_results"("source_category_id");

-- CreateIndex
CREATE INDEX "crawl_run_category_results_raw_snapshot_id_idx" ON "crawl_run_category_results"("raw_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_run_category_results_crawl_run_id_source_category_id_key" ON "crawl_run_category_results"("crawl_run_id", "source_category_id");

-- CreateIndex
CREATE INDEX "raw_snapshots_source_category_id_fetched_at_idx" ON "raw_snapshots"("source_category_id", "fetched_at");

-- CreateIndex
CREATE INDEX "raw_snapshots_content_hash_idx" ON "raw_snapshots"("content_hash");

-- CreateIndex
CREATE INDEX "raw_snapshots_crawl_run_id_idx" ON "raw_snapshots"("crawl_run_id");

-- CreateIndex
CREATE INDEX "raw_snapshots_duplicate_of_snapshot_id_idx" ON "raw_snapshots"("duplicate_of_snapshot_id");

-- CreateIndex
CREATE INDEX "parse_errors_crawl_run_id_idx" ON "parse_errors"("crawl_run_id");

-- CreateIndex
CREATE INDEX "parse_errors_raw_snapshot_id_idx" ON "parse_errors"("raw_snapshot_id");

-- CreateIndex
CREATE INDEX "parse_errors_source_category_id_created_at_idx" ON "parse_errors"("source_category_id", "created_at");

-- CreateIndex
CREATE INDEX "parse_errors_error_type_idx" ON "parse_errors"("error_type");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "source_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_raw_snapshot_id_fkey" FOREIGN KEY ("raw_snapshot_id") REFERENCES "raw_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_prices" ADD CONSTRAINT "current_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_prices" ADD CONSTRAINT "current_prices_price_snapshot_id_product_id_fkey" FOREIGN KEY ("price_snapshot_id", "product_id") REFERENCES "price_snapshots"("id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_run_category_results" ADD CONSTRAINT "crawl_run_category_results_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_run_category_results" ADD CONSTRAINT "crawl_run_category_results_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "source_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_run_category_results" ADD CONSTRAINT "crawl_run_category_results_raw_snapshot_id_fkey" FOREIGN KEY ("raw_snapshot_id") REFERENCES "raw_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_snapshots" ADD CONSTRAINT "raw_snapshots_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_snapshots" ADD CONSTRAINT "raw_snapshots_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "source_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_snapshots" ADD CONSTRAINT "raw_snapshots_duplicate_of_snapshot_id_fkey" FOREIGN KEY ("duplicate_of_snapshot_id") REFERENCES "raw_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_errors" ADD CONSTRAINT "parse_errors_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_errors" ADD CONSTRAINT "parse_errors_raw_snapshot_id_fkey" FOREIGN KEY ("raw_snapshot_id") REFERENCES "raw_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_errors" ADD CONSTRAINT "parse_errors_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "source_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateView
CREATE VIEW "product_list_view" AS
SELECT
    "products"."id" AS "product_id",
    "products"."name" AS "product_name",
    "products"."normalized_name",
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
