// apps/crawler/tests/scripts/ops/discord-bot/scheduled-price-report/scheduled-price-report-timing.test.ts
// 驗證個人排程價格報告的 daemon sleep 計算與最早到期設定讀取。

import { describe, expect, it } from "vitest";
import {
  calculateScheduledPriceReportSleepMs,
  readNextScheduledPriceReportDueAt,
} from "../../../../../src/scripts/ops/discord-bot/price-report";

import { createDiscordBotClient } from "../support/client";
import { priceReportSetting } from "../support/data-factories";

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

  it.each([
    {
      caseName: "unclaimed due work",
      deliveryClaimedAt: null,
      expectedWakeAt: "2026-06-07T04:59:00.000Z",
      expectedSleepMs: 1000,
    },
    {
      caseName: "fresh claim",
      deliveryClaimedAt: "2026-06-07T04:50:00.000Z",
      expectedWakeAt: "2026-06-07T05:05:00.000Z",
      expectedSleepMs: 5 * 60_000,
    },
    {
      caseName: "claim at the exact stale boundary",
      deliveryClaimedAt: "2026-06-07T04:45:00.000Z",
      expectedWakeAt: "2026-06-07T04:59:00.000Z",
      expectedSleepMs: 1000,
    },
  ])("calculates the next wake for $caseName", async (testCase) => {
    const now = new Date("2026-06-07T05:00:00.000Z");
    const client = createDiscordBotClient({
      settings: [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
          deliveryClaimedAt: testCase.deliveryClaimedAt
            ? new Date(testCase.deliveryClaimedAt)
            : null,
        }),
      ],
    });

    const nextWakeAt = await readNextScheduledPriceReportDueAt({ client, now });

    expect(nextWakeAt).toEqual(new Date(testCase.expectedWakeAt));
    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: nextWakeAt,
        maxSleepMs: 10 * 60_000,
      }),
    ).toBe(testCase.expectedSleepMs);
  });
});
