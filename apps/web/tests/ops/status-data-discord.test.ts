// apps/web/tests/ops/status-data-discord.test.ts
// 驗證待移除的 /ops/status Discord delivery 健康摘要與失敗恢復判斷。

import { describe, expect, it } from "vitest";
import { collectOpsStatus } from "../../app/ops/status/data";
import { fakeOpsClient, NOW } from "./status-data-support";

describe("collectOpsStatus Discord delivery health", () => {
  it("warns when recent Discord bot deliveries failed or hit rate limits", async () => {
    const summary = await collectOpsStatus(
      fakeOpsClient({
        discordDeliveryCounts: {
          TARGET_PRICE: {
            FAILED: 1,
          },
          SCHEDULED_PRICE_REPORT: {
            RATE_LIMITED: 1,
          },
        },
      }),
      {
        now: () => NOW,
        productImageStorageDir: "/images",
        productImageExists: async () => true,
      },
    );

    expect(summary.overallLevel).toBe("warn");
    expect(summary.checks.find((check) => check.key === "discord-bot-delivery")).toMatchObject({
      level: "warn",
      message: "failed=1 rateLimited=1 in 24h",
    });
  });

  it("does not warn when later Discord bot deliveries resolve earlier failures", async () => {
    const summary = await collectOpsStatus(
      fakeOpsClient({
        discordDeliveryRecords: [
          {
            id: "delivery-success",
            discordUserId: "discord-user-1",
            kind: "SCHEDULED_PRICE_REPORT",
            status: "SENT",
            targetPriceWatchId: null,
            itemCount: 5,
            messageCount: 1,
            deliveredAt: new Date("2026-06-07T11:20:00.000Z"),
            createdAt: new Date("2026-06-07T11:20:00.000Z"),
          },
          {
            id: "delivery-failed",
            discordUserId: "discord-user-1",
            kind: "SCHEDULED_PRICE_REPORT",
            status: "FAILED",
            targetPriceWatchId: null,
            itemCount: 5,
            messageCount: 1,
            deliveredAt: null,
            createdAt: new Date("2026-06-07T11:10:00.000Z"),
          },
        ],
      }),
      {
        now: () => NOW,
        productImageStorageDir: "/images",
        productImageExists: async () => true,
      },
    );

    expect(summary.checks.find((check) => check.key === "discord-bot-delivery")).toMatchObject({
      level: "ok",
      message: "failed=0 rateLimited=0 in 24h",
    });
  });
});
