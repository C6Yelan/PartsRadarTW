ALTER TABLE "discord_public_price_report_settings"
ADD COLUMN "max_items" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "category_igrps" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "product_keyword" TEXT,
ADD COLUMN "include_price_drops" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "include_price_rises" BOOLEAN NOT NULL DEFAULT true;
