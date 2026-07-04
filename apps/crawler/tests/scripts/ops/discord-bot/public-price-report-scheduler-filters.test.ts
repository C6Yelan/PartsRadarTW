// apps/crawler/tests/scripts/ops/discord-bot/public-price-report-scheduler-filters.test.ts
import { describe, expect, it, vi } from "vitest";
import { sendPendingPublicPriceReports } from "../../../../src/scripts/ops/discord-bot/public-price-report";
import type { DiscordBotMessage } from "../../../../src/scripts/ops/discord-bot/types";
import {
  crawlRun,
  createDiscordBotClient,
  createDiscordBotOptions,
  publicPriceReportDelivery,
  publicPriceReportSetting,
  snapshot,
  TEST_SOURCE_CATEGORIES,
} from "./support";

describe("public price report scheduler filters", () => {
  it("applies public report filters to pending scheduled reports", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "old-filtered-public-1",
          productId: "product-filtered-public-1",
          productName: "華碩 RTX 5090 顯示卡",
          crawlRunId: "old-run",
          price: 99_990,
          capturedAt: "2026-06-06T01:00:00.000Z",
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "new-filtered-public-1",
          productId: "product-filtered-public-1",
          productName: "華碩 RTX 5090 顯示卡",
          crawlRunId: "public-run-1",
          price: 95_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "old-filtered-public-rise",
          productId: "product-filtered-public-rise",
          productName: "華碩 RTX 5090 OC 顯示卡",
          crawlRunId: "old-run",
          price: 95_990,
          capturedAt: "2026-06-06T01:00:00.000Z",
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "new-filtered-public-rise",
          productId: "product-filtered-public-rise",
          productName: "華碩 RTX 5090 OC 顯示卡",
          crawlRunId: "public-run-1",
          price: 99_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "old-filtered-public-keyword",
          productId: "product-filtered-public-keyword",
          productName: "華碩 RTX 5080 顯示卡",
          crawlRunId: "old-run",
          price: 49_990,
          capturedAt: "2026-06-06T01:00:00.000Z",
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "new-filtered-public-keyword",
          productId: "product-filtered-public-keyword",
          productName: "華碩 RTX 5080 顯示卡",
          crawlRunId: "public-run-1",
          price: 45_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
      ],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [
        crawlRun({
          id: "public-run-1",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      [
        publicPriceReportSetting({
          id: "public-setting-1",
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includePriceDrops: true,
          includePriceRises: false,
        }),
      ],
    );
    const sendChannelMessages = vi.fn(
      async (_channelId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
      }),
    ).resolves.toMatchObject({
      settingCount: 1,
      processedCount: 1,
      sentCount: 1,
    });

    const reportText = JSON.stringify(sendChannelMessages.mock.calls[0]?.[1]);

    expect(reportText).toContain("RTX 5090 顯示卡");
    expect(reportText).not.toContain("RTX 5090 OC");
    expect(reportText).not.toContain("RTX 5080");
    expect(client.discordPublicPriceReportDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          itemCount: 1,
        }),
      }),
    );
  });

  it("skips public price reports when no public report setting is configured", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [crawlRun({ id: "public-run-1" })],
    );
    const sendChannelMessages = vi.fn();

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
      }),
    ).resolves.toEqual({
      settingCount: 0,
      processedCount: 0,
      sentCount: 0,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(client.crawlRun.findMany).not.toHaveBeenCalled();
    expect(sendChannelMessages).not.toHaveBeenCalled();
  });

  it("does not resend public reports that were already delivered", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [
        publicPriceReportDelivery({
          id: "public-delivery-1",
          crawlRunId: "public-run-1",
          channelId: "999988887777666655",
          status: "SENT",
        }),
      ],
      [crawlRun({ id: "public-run-1" })],
      [publicPriceReportSetting({ id: "public-setting-1" })],
    );
    const sendChannelMessages = vi.fn();

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
      }),
    ).resolves.toEqual({
      settingCount: 1,
      processedCount: 0,
      sentCount: 0,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendChannelMessages).not.toHaveBeenCalled();
  });
});
