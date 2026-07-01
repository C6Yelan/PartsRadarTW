-- CreateTable
CREATE TABLE "discord_public_price_report_deliveries" (
    "id" UUID NOT NULL,
    "crawl_run_id" UUID NOT NULL,
    "channel_id" TEXT NOT NULL,
    "status" "discord_notification_status" NOT NULL,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discord_public_price_report_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_public_report_deliveries_run_channel_key" ON "discord_public_price_report_deliveries"("crawl_run_id", "channel_id");

-- CreateIndex
CREATE INDEX "discord_public_price_report_deliveries_channel_created_at_idx" ON "discord_public_price_report_deliveries"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "discord_public_price_report_deliveries_status_created_at_idx" ON "discord_public_price_report_deliveries"("status", "created_at");

-- AddForeignKey
ALTER TABLE "discord_public_price_report_deliveries" ADD CONSTRAINT "discord_public_report_deliveries_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
