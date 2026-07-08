// apps/crawler/tests/scripts/ops/discord-bot/scheduled-price-report-timing.test.ts
// 驗證個人排程價格報告的 daemon sleep 計算與最早到期設定讀取。

import { describe, expect, it } from "vitest";
import {
  calculateScheduledPriceReportSleepMs,
  readNextScheduledPriceReportDueAt,
} from "../../../../src/scripts/ops/discord-bot/price-report";

import { createDiscordBotClient, priceReportSetting } from "./support";

describe("scheduled price report timing", () => {
  it("calculates precise scheduled report sleeps without busy polling", () => {
    const now = new Date("2026-06-07T05:00:00.000Z");

    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: new Date("2026-06-07T05:02:30.000Z"),
        maxSleepMs: 300_000,
      }),
    ).toBe(150_000);
    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: new Date("2026-06-07T05:10:00.000Z"),
        maxSleepMs: 300_000,
      }),
    ).toBe(300_000);
    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: new Date("2026-06-07T04:59:59.000Z"),
        maxSleepMs: 300_000,
      }),
    ).toBe(1000);
    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: null,
        maxSleepMs: 300_000,
      }),
    ).toBe(300_000);
  });

  it("reads the earliest enabled scheduled price report due time", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-later",
          discordUserId: "222233334444555566",
          nextSendAt: new Date("2026-06-07T06:00:00.000Z"),
        }),
        priceReportSetting({
          id: "setting-disabled",
          discordUserId: "333344445555666677",
          nextSendAt: new Date("2026-06-07T04:00:00.000Z"),
          enabled: false,
        }),
        priceReportSetting({
          id: "setting-earlier",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T05:00:00.000Z"),
        }),
      ],
    );

    await expect(readNextScheduledPriceReportDueAt({ client })).resolves.toEqual(
      new Date("2026-06-07T05:00:00.000Z"),
    );
    expect(client.discordPriceReportSetting.findFirst).toHaveBeenCalledWith({
      where: {
        enabled: true,
        nextSendAt: {
          not: null,
        },
      },
      select: {
        nextSendAt: true,
      },
      orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
    });
  });
});
