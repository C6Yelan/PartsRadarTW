-- CreateEnum
CREATE TYPE "discord_price_report_interval" AS ENUM ('daily', 'every_12h', 'every_6h');

-- CreateEnum
CREATE TYPE "discord_price_report_window" AS ENUM ('24h', '12h', '6h');

-- CreateEnum
CREATE TYPE "discord_price_report_scope" AS ENUM ('all', 'watchlist');

-- CreateEnum
CREATE TYPE "discord_notification_kind" AS ENUM ('price_report_now', 'scheduled_price_report', 'target_price');

-- CreateEnum
CREATE TYPE "discord_notification_status" AS ENUM ('sent', 'skipped', 'failed', 'rate_limited');

-- CreateTable
CREATE TABLE "discord_price_report_settings" (
    "id" UUID NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "interval" "discord_price_report_interval" NOT NULL,
    "window" "discord_price_report_window" NOT NULL,
    "scope" "discord_price_report_scope" NOT NULL DEFAULT 'all',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Taipei',
    "max_items" INTEGER NOT NULL DEFAULT 50,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "next_send_at" TIMESTAMPTZ(6),
    "last_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discord_price_report_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_target_price_watches" (
    "id" UUID NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "target_price" INTEGER NOT NULL,
    "currency" "currency" NOT NULL DEFAULT 'TWD',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discord_target_price_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_notification_deliveries" (
    "id" UUID NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "kind" "discord_notification_kind" NOT NULL,
    "status" "discord_notification_status" NOT NULL,
    "product_id" UUID,
    "target_price_watch_id" UUID,
    "dedupe_key" TEXT,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_price_report_settings_discord_user_id_key" ON "discord_price_report_settings"("discord_user_id");

-- CreateIndex
CREATE INDEX "discord_price_report_settings_enabled_next_send_at_idx" ON "discord_price_report_settings"("enabled", "next_send_at");

-- CreateIndex
CREATE INDEX "discord_target_price_watches_user_enabled_idx" ON "discord_target_price_watches"("discord_user_id", "enabled");

-- CreateIndex
CREATE INDEX "discord_target_price_watches_product_enabled_idx" ON "discord_target_price_watches"("product_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "discord_notification_deliveries_dedupe_key_key" ON "discord_notification_deliveries"("dedupe_key");

-- CreateIndex
CREATE INDEX "discord_notification_deliveries_user_created_at_idx" ON "discord_notification_deliveries"("discord_user_id", "created_at");

-- CreateIndex
CREATE INDEX "discord_notification_deliveries_kind_status_created_at_idx" ON "discord_notification_deliveries"("kind", "status", "created_at");

-- CreateIndex
CREATE INDEX "discord_notification_deliveries_product_id_idx" ON "discord_notification_deliveries"("product_id");

-- CreateIndex
CREATE INDEX "discord_notification_deliveries_target_watch_id_idx" ON "discord_notification_deliveries"("target_price_watch_id");

-- AddForeignKey
ALTER TABLE "discord_target_price_watches" ADD CONSTRAINT "discord_target_price_watches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_notification_deliveries" ADD CONSTRAINT "discord_notification_deliveries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_notification_deliveries" ADD CONSTRAINT "discord_notification_deliveries_target_price_watch_id_fkey" FOREIGN KEY ("target_price_watch_id") REFERENCES "discord_target_price_watches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
