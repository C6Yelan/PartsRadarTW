// apps/crawler/tests/scripts/ops/discord-bot/public-price-report/public-price-report-messages.test.ts
// 驗證公開價格報告訊息會正確呈現價格變動、新增商品與 Discord embed 結構。

import { describe, expect, it } from "vitest";
import { createPublicPriceReportMessages } from "../../../../../src/scripts/ops/discord-bot/price-report/messages";
import { PUBLIC_BASE_URL } from "../support/options";

describe("public price report messages", () => {
  it("creates public price-change report messages with the bot embed format", () => {
    const messages = createPublicPriceReportMessages(
      {
        priceChanges: [
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
        newProducts: [],
      },
      {
        publicBaseUrl: PUBLIC_BASE_URL,
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

  it("uses the fixed system limit of 100 public report items", () => {
    const messages = createPublicPriceReportMessages(
      {
        priceChanges: [],
        newProducts: Array.from({ length: 101 }, (_, index) => ({
          productId: `product-${index}`,
          productName: `New Product ${index}`,
          category: { igrp: 12, displayName: "顯示卡" },
          subcategory: { slug: "asus", displayName: "華碩" },
          currentPrice: 10_000 + index,
          currency: "TWD",
          firstSeenAt: new Date("2026-06-07T03:00:00.000Z"),
        })),
      },
      {
        publicBaseUrl: PUBLIC_BASE_URL,
        generatedAt: new Date("2026-06-07T05:00:00.000Z"),
      },
    );
    const output = JSON.stringify(messages);

    expect(output).toContain("products/product-99");
    expect(output).not.toContain("products/product-100");
    expect(output).toContain("另有 1 個新增商品未列出");
  });
});
