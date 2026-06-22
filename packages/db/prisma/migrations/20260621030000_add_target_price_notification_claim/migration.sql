ALTER TABLE "discord_target_price_watches"
ADD COLUMN "notification_claimed_at" TIMESTAMPTZ(6);

CREATE INDEX "discord_target_price_watches_notification_due_idx"
ON "discord_target_price_watches"("enabled", "last_notified_at", "notification_claimed_at");
