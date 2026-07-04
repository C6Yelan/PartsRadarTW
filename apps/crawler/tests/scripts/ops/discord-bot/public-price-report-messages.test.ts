// apps/crawler/tests/scripts/ops/discord-bot/public-price-report-messages.test.ts
import { describe, expect, it } from "vitest";
import {
  createPublicPriceChangeReportMessages,
  createPublicPriceReportMessages,
} from "../../../../src/scripts/ops/discord-bot/price-report";
import { PUBLIC_BASE_URL } from "./support";

describe("public price report messages", () => {
  it("creates public price-change report messages with the bot embed format", () => {
    const messages = createPublicPriceChangeReportMessages(
      [
        {
          productId: "product-1",
          productName: "華碩 GPU A",
          category: { igrp: 12, displayName: "顯示卡" },
          subcategory: { slug: "asus", displayName: "華碩" },
          previousPrice: 12_000,
          currentPrice: 10_990,
          currency: "TWD",
          changedAt: new Date("2026-06-07T03:00:00.000Z"),
          delta: -1010,
        },
      ],
      {
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 50,
        generatedAt: new Date("2026-06-07T05:00:00.000Z"),
      },
    );

    expect(messages).toEqual([
      {
        embeds: [
          expect.objectContaining({
            title: "PartsRadarTW 公開價格報告 - 價格變動",
            description: expect.stringContaining("本輪更新：**降價 1**，**漲價 0**"),
          }),
        ],
      },
    ]);
    expect(messages[0]?.embeds?.[0]?.description).toContain(
      "\n__**降價 (1)**__\n**顯示卡**\n**華碩**\n- **-NT$1,010** NT$12,000 -> NT$10,990 [GPU A]",
    );
    expect(messages[0]?.embeds?.[0]?.fields).toBeUndefined();
  });

  it("creates public report messages with new products", () => {
    const messages = createPublicPriceReportMessages(
      {
        priceChanges: [],
        newProducts: [
          {
            productId: "product-new-1",
            productName: "華碩 RTX 5090 新品顯示卡",
            category: { igrp: 12, displayName: "顯示卡" },
            subcategory: { slug: "asus", displayName: "華碩" },
            currentPrice: 99_990,
            currency: "TWD",
            firstSeenAt: new Date("2026-06-07T03:00:00.000Z"),
          },
        ],
      },
      {
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 50,
        generatedAt: new Date("2026-06-07T05:00:00.000Z"),
      },
    );

    expect(messages).toEqual([
      {
        embeds: [
          expect.objectContaining({
            title: "PartsRadarTW 公開價格報告 - 新增商品",
            description: expect.stringContaining("本輪更新：**1 個新增商品**"),
          }),
        ],
      },
    ]);
    expect(messages[0]?.embeds?.[0]?.description).toContain(
      "\n**顯示卡**\n**華碩**\n- **NT$99,990** [RTX 5090 新品顯示卡]",
    );
  });
});
