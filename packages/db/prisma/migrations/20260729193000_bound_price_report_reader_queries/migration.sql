CREATE INDEX "price_snapshots_product_id_captured_at_id_idx"
ON "price_snapshots"("product_id", "captured_at" DESC, "id" DESC);

CREATE INDEX "price_snapshots_crawl_run_id_captured_at_id_idx"
ON "price_snapshots"("crawl_run_id", "captured_at", "id");

DROP INDEX "price_snapshots_product_id_captured_at_idx";
DROP INDEX "price_snapshots_crawl_run_id_idx";
