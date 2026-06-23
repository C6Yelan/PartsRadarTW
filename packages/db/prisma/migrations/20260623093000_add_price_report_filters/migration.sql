ALTER TABLE "discord_price_report_settings"
ADD COLUMN "category_igrps" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "include_price_drops" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "include_price_rises" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "include_new_products" BOOLEAN NOT NULL DEFAULT true;
