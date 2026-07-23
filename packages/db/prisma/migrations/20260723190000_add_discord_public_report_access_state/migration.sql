CREATE TYPE "discord_public_report_access_status" AS ENUM (
  'active',
  'paused_permission',
  'disabled_channel_gone',
  'disabled_bot_removed'
);

DROP INDEX "discord_public_price_report_settings_enabled_channel_idx";

ALTER TABLE "discord_public_price_report_settings"
ADD COLUMN "access_status" "discord_public_report_access_status" NOT NULL DEFAULT 'active',
ADD COLUMN "disabled_at" TIMESTAMPTZ(6),
ADD COLUMN "last_discord_error_code" INTEGER,
ADD COLUMN "last_access_checked_at" TIMESTAMPTZ(6),
ADD COLUMN "consecutive_access_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "retry_not_before" TIMESTAMPTZ(6);

CREATE INDEX "discord_public_report_settings_delivery_due_idx"
ON "discord_public_price_report_settings"(
  "enabled",
  "access_status",
  "retry_not_before"
);
