ALTER TABLE "discord_price_report_settings"
ADD COLUMN "notification_cursor_at" TIMESTAMPTZ(6);

ALTER TABLE "discord_public_price_report_settings"
ADD COLUMN "notification_cursor_at" TIMESTAMPTZ(6);

ALTER TABLE "discord_target_price_watches"
ADD COLUMN "notification_cursor_at" TIMESTAMPTZ(6);

UPDATE "discord_price_report_settings"
SET "notification_cursor_at" = CURRENT_TIMESTAMP
WHERE "notification_cursor_at" IS NULL;

UPDATE "discord_public_price_report_settings"
SET "notification_cursor_at" = CURRENT_TIMESTAMP
WHERE "notification_cursor_at" IS NULL;

UPDATE "discord_target_price_watches"
SET "notification_cursor_at" = CURRENT_TIMESTAMP
WHERE "notification_cursor_at" IS NULL;
