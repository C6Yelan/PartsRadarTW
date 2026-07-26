ALTER TABLE "discord_public_price_report_settings"
ALTER COLUMN "created_by_discord_user_id" DROP NOT NULL,
ALTER COLUMN "updated_by_discord_user_id" DROP NOT NULL;

ALTER TABLE "discord_notification_deliveries"
ADD COLUMN "price_report_setting_id" UUID;

ALTER TABLE "discord_public_price_report_deliveries"
ADD COLUMN "public_price_report_setting_id" UUID;

UPDATE "discord_notification_deliveries" AS delivery
SET "price_report_setting_id" = setting."id"
FROM "discord_price_report_settings" AS setting
WHERE delivery."kind" = 'scheduled_price_report'
  AND delivery."discord_user_id" = setting."discord_user_id";

WITH uniquely_owned_channels AS (
  SELECT "channel_id", MIN("id"::text)::uuid AS "setting_id"
  FROM "discord_public_price_report_settings"
  GROUP BY "channel_id"
  HAVING COUNT(*) = 1
)
UPDATE "discord_public_price_report_deliveries" AS delivery
SET "public_price_report_setting_id" = ownership."setting_id"
FROM uniquely_owned_channels AS ownership
WHERE delivery."channel_id" = ownership."channel_id";

DROP INDEX "discord_notification_deliveries_target_watch_id_idx";

ALTER TABLE "discord_notification_deliveries"
DROP CONSTRAINT "discord_notification_deliveries_target_price_watch_id_fkey";

ALTER TABLE "discord_notification_deliveries"
ADD CONSTRAINT "discord_notification_deliveries_target_price_watch_id_fkey"
FOREIGN KEY ("target_price_watch_id")
REFERENCES "discord_target_price_watches"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "discord_notification_deliveries_target_watch_id_idx"
ON "discord_notification_deliveries"("target_price_watch_id");

CREATE INDEX "discord_notification_deliveries_price_report_setting_id_idx"
ON "discord_notification_deliveries"("price_report_setting_id");

CREATE INDEX "discord_public_price_report_deliveries_setting_id_idx"
ON "discord_public_price_report_deliveries"("public_price_report_setting_id");

ALTER TABLE "discord_notification_deliveries"
ADD CONSTRAINT "discord_notification_deliveries_price_report_setting_id_fkey"
FOREIGN KEY ("price_report_setting_id")
REFERENCES "discord_price_report_settings"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "discord_public_price_report_deliveries"
ADD CONSTRAINT "discord_public_price_report_deliveries_setting_id_fkey"
FOREIGN KEY ("public_price_report_setting_id")
REFERENCES "discord_public_price_report_settings"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
