ALTER TABLE "discord_price_report_settings"
ADD COLUMN "disabled_at" TIMESTAMPTZ(6);

ALTER TABLE "discord_target_price_watches"
ADD COLUMN "disabled_at" TIMESTAMPTZ(6);

ALTER TABLE "discord_public_price_report_settings"
ADD COLUMN "purge_after" TIMESTAMPTZ(6);

UPDATE "discord_price_report_settings"
SET "disabled_at" = "updated_at"
WHERE "enabled" = false;

UPDATE "discord_target_price_watches"
SET "disabled_at" = "updated_at"
WHERE "enabled" = false;

UPDATE "discord_public_price_report_settings"
SET "purge_after" =
  CASE
    WHEN "access_status" = 'paused_permission'
      THEN "disabled_at" + INTERVAL '30 days'
    WHEN "access_status" IN ('disabled_channel_gone', 'disabled_bot_removed')
      THEN "disabled_at" + INTERVAL '60 days'
    ELSE NULL
  END
WHERE "disabled_at" IS NOT NULL;

CREATE INDEX "discord_public_report_settings_purge_after_idx"
ON "discord_public_price_report_settings"("purge_after");
