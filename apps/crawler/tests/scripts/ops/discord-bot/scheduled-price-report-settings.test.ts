// apps/crawler/tests/scripts/ops/discord-bot/scheduled-price-report-settings.test.ts
// 驗證個人每日價格報告設定會建立排程，並正確換算指定的台北發送時間。

import { describe, expect, it } from "vitest";
import { enableDailyScheduledPriceReport } from "../../../../src/scripts/ops/discord-bot/price-report";

import { createDiscordBotClient, priceReportSetting } from "./support";

describe("scheduled price report settings", () => {
  it("enables daily report settings for a Discord user", async () => {
    const client = createDiscordBotClient([]);
    const setting = await enableDailyScheduledPriceReport({
      client,
      discordUserId: "111122223333444455",
      windowHours: 12,
      now: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(setting).toMatchObject({
      discordUserId: "111122223333444455",
      interval: "DAILY",
      window: "HOURS_12",
      includeNewProducts: false,
      enabled: true,
      nextSendAt: new Date("2026-06-08T05:00:00.000Z"),
    });
    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          discordUserId: "111122223333444455",
        },
        create: expect.not.objectContaining({ maxItems: expect.anything() }),
        update: expect.not.objectContaining({ maxItems: expect.anything() }),
        select: expect.not.objectContaining({ maxItems: true }),
      }),
    );
  });

  it("enables daily report settings at a specific Taipei time", async () => {
    const client = createDiscordBotClient([]);
    const setting = await enableDailyScheduledPriceReport({
      client,
      discordUserId: "111122223333444455",
      windowHours: 24,
      timeOfDay: {
        hour: 21,
        minute: 30,
      },
      now: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(setting).toMatchObject({
      nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
    });
  });

  it("preserves an existing include-new-products choice and dormant max-items value", async () => {
    const existing = priceReportSetting({
      id: "setting-1",
      discordUserId: "111122223333444455",
      maxItems: 8,
      includeNewProducts: true,
      nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
    });
    const client = createDiscordBotClient([], [existing]);

    await enableDailyScheduledPriceReport({
      client,
      discordUserId: existing.discordUserId,
      windowHours: 24,
      includeNewProducts: existing.includeNewProducts,
      now: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(existing.maxItems).toBe(8);
    expect(existing.includeNewProducts).toBe(true);
    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.not.objectContaining({ maxItems: expect.anything() }),
        update: expect.objectContaining({ includeNewProducts: true }),
      }),
    );
  });
});
