CREATE TABLE "discord_target_price_notification_scan_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "cursor_updated_at" TIMESTAMPTZ(6),
    "cursor_watch_id" UUID,
    "round_upper_updated_at" TIMESTAMPTZ(6),
    "round_upper_watch_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discord_target_price_notification_scan_state_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "discord_target_price_notification_scan_state_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "discord_target_price_notification_scan_state_cursor_check" CHECK (
        ("cursor_updated_at" IS NULL) = ("cursor_watch_id" IS NULL)
    ),
    CONSTRAINT "discord_target_price_notification_scan_state_round_upper_check" CHECK (
        ("round_upper_updated_at" IS NULL) = ("round_upper_watch_id" IS NULL)
    ),
    CONSTRAINT "discord_target_price_notification_scan_state_round_check" CHECK (
        "cursor_updated_at" IS NULL
        OR (
            "round_upper_updated_at" IS NOT NULL
            AND ("cursor_updated_at", "cursor_watch_id")
                <= ("round_upper_updated_at", "round_upper_watch_id")
        )
    )
);

INSERT INTO "discord_target_price_notification_scan_state" ("id", "updated_at")
VALUES (1, CURRENT_TIMESTAMP);

CREATE INDEX "discord_target_price_watches_pending_scan_idx"
ON "discord_target_price_watches"("updated_at", "id")
WHERE "enabled" = true AND "last_notified_at" IS NULL;
