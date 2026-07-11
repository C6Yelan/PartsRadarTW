-- Preserve all existing delivery audit rows while adding structured metadata for future failures.
CREATE TYPE "discord_delivery_error_category" AS ENUM (
    'permissions',
    'dm_unavailable',
    'rate_limited',
    'interaction_expired',
    'transport',
    'provider'
);

ALTER TABLE "discord_notification_deliveries"
    ADD COLUMN "error_category" "discord_delivery_error_category",
    ADD COLUMN "http_status" INTEGER,
    ADD COLUMN "provider_error_code" INTEGER;

ALTER TABLE "discord_public_price_report_deliveries"
    ADD COLUMN "error_category" "discord_delivery_error_category",
    ADD COLUMN "http_status" INTEGER,
    ADD COLUMN "provider_error_code" INTEGER;
