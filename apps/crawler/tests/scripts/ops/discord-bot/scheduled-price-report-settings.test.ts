// apps/crawler/tests/scripts/ops/discord-bot/scheduled-price-report-settings.test.ts
import { describe, expect, it } from "vitest";
import { enableDailyScheduledPriceReport } from "../../../../src/scripts/ops/discord-bot/price-report";

import { createDiscordBotClient } from "./support";

describe("scheduled price report settings", () => {
  it("enables daily report settings for a Discord user", async () => {
    const client = createDiscordBotClient([]);
    const setting = await enableDailyScheduledPriceReport({
      client,
      discordUserId: "111122223333444455",
      windowHours: 12,
      maxItems: 10,
      now: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(setting).toMatchObject({
      discordUserId: "111122223333444455",
      interval: "DAILY",
      window: "HOURS_12",
      maxItems: 10,
      enabled: true,
      nextSendAt: new Date("2026-06-08T05:00:00.000Z"),
    });
    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          discordUserId: "111122223333444455",
        },
      }),
    );
  });

  it("enables daily report settings at a specific Taipei time", async () => {
    const client = createDiscordBotClient([]);
    const setting = await enableDailyScheduledPriceReport({
      client,
      discordUserId: "111122223333444455",
      windowHours: 24,
      maxItems: 50,
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
});
