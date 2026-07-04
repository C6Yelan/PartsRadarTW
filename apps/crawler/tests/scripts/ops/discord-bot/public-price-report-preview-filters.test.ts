// apps/crawler/tests/scripts/ops/discord-bot/public-price-report-preview-filters.test.ts
import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createPublicReportInteraction,
  publicPriceReportSetting,
  snapshot,
  TEST_SOURCE_CATEGORIES,
} from "./support";

describe("public price report preview filters", () => {
  it("applies public report filters to preview reports", async () => {
    const now = new Date();
    const oldCapturedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const newCapturedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "public-filter-old-1",
          productId: "public-filter-product-1",
          productName: "華碩 RTX 5090 顯示卡",
          crawlRunId: "old-run",
          price: 99_990,
          capturedAt: oldCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "public-filter-new-1",
          productId: "public-filter-product-1",
          productName: "華碩 RTX 5090 顯示卡",
          crawlRunId: "new-run",
          price: 95_990,
          capturedAt: newCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "public-filter-old-rise",
          productId: "public-filter-product-rise",
          productName: "華碩 RTX 5090 OC 顯示卡",
          crawlRunId: "old-run",
          price: 95_990,
          capturedAt: oldCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "public-filter-new-rise",
          productId: "public-filter-product-rise",
          productName: "華碩 RTX 5090 OC 顯示卡",
          crawlRunId: "new-run",
          price: 99_990,
          capturedAt: newCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "public-filter-old-category",
          productId: "public-filter-product-category",
          productName: "華碩 RTX 5090 外接盒",
          crawlRunId: "old-run",
          price: 19_990,
          capturedAt: oldCapturedAt,
          categoryIgrp: 7,
          categoryName: "SSD / HDD",
        }),
        snapshot({
          id: "public-filter-new-category",
          productId: "public-filter-product-category",
          productName: "華碩 RTX 5090 外接盒",
          crawlRunId: "new-run",
          price: 18_990,
          capturedAt: newCapturedAt,
          categoryIgrp: 7,
          categoryName: "SSD / HDD",
        }),
        snapshot({
          id: "public-filter-old-keyword",
          productId: "public-filter-product-keyword",
          productName: "華碩 RTX 5080 顯示卡",
          crawlRunId: "old-run",
          price: 49_990,
          capturedAt: oldCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "public-filter-new-keyword",
          productId: "public-filter-product-keyword",
          productName: "華碩 RTX 5080 顯示卡",
          crawlRunId: "new-run",
          price: 45_990,
          capturedAt: newCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
      ],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [],
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
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "test" }),
    });

    const reportBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const reportText = JSON.stringify(reportBody.embeds);

    expect(reportText).toContain("RTX 5090 顯示卡");
    expect(reportText).not.toContain("RTX 5090 OC");
    expect(reportText).not.toContain("RTX 5090 外接盒");
    expect(reportText).not.toContain("RTX 5080");
  });
});
