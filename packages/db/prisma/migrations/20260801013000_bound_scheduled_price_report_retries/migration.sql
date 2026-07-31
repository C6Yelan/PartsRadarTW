CREATE TYPE "discord_price_report_delivery_state" AS ENUM (
  'active',
  'paused_permanent_failure',
  'paused_retry_exhausted',
  'paused_partial_delivery'
);

ALTER TABLE "discord_price_report_settings"
ADD COLUMN "delivery_state" "discord_price_report_delivery_state" NOT NULL DEFAULT 'active',
ADD COLUMN "consecutive_delivery_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "delivery_claimed_at" TIMESTAMPTZ(6);

CREATE INDEX "discord_price_report_settings_delivery_due_idx"
ON "discord_price_report_settings"(
  "enabled",
  "delivery_state",
  "next_send_at",
  "delivery_claimed_at"
);
