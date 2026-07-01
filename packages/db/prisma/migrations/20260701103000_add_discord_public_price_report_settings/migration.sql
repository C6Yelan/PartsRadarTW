-- CreateTable
CREATE TABLE "discord_public_price_report_settings" (
    "id" UUID NOT NULL,
    "discord_guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_discord_user_id" TEXT NOT NULL,
    "updated_by_discord_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discord_public_price_report_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_public_price_report_settings_guild_id_key" ON "discord_public_price_report_settings"("discord_guild_id");

-- CreateIndex
CREATE INDEX "discord_public_price_report_settings_enabled_channel_idx" ON "discord_public_price_report_settings"("enabled", "channel_id");
