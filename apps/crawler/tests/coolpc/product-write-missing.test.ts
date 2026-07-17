// apps/crawler/tests/coolpc/product-write-missing.test.ts
// 驗證 product-write 會在成功分類觀測後更新商品缺漏、停用與恢復狀態。

import { describe, expect, it } from "vitest";
import { writeCoolpcCategoryProductObservation } from "../../src/coolpc/product-write";
import { FakeCoolpcProductWriteClient, productItem } from "./support/product-write-client";

describe("CoolPC category product observation writer missing lifecycle", () => {
  it("immediately hides an explicitly excluded existing product", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const fetchedAt = new Date("2026-05-27T11:00:00.000Z");
    client.seedProductWithCurrentPrice(
      productItem({
        ibuyToken: "CPU-BUNDLE-BOARD",
        name: "[搭CPU現省500] 技嘉 B860M GAMING X WIFI6E(M-ATX)",
        price: 4990,
      }),
    );

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt,
      parsedProducts: [],
      excludedIbuyTokens: ["CPU-BUNDLE-BOARD"],
    });

    expect(result).toMatchObject({
      missingProductUpdatedCount: 1,
      markedInactiveProductCount: 1,
    });
    expect(client.products[0]).toMatchObject({
      isActive: false,
      missingSince: fetchedAt,
      missingSeenCount: 6,
    });
  });

  it("immediately hides an excluded bundle-only power supply from the case category", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const fetchedAt = new Date("2026-07-17T11:00:00.000Z");
    client.seedProductWithCurrentPrice({
      ...productItem({
        sourceCategoryId: "category-14",
        ibuyToken: "CASE-BUNDLE-PSU",
        name: "【限搭購喬思伯機殼】全漢 金鋼彈 650W 金牌 全模【SFX規格】",
        normalizedName: "【限搭購喬思伯機殼】全漢 金鋼彈 650w 金牌 全模【sfx規格】",
        price: 3490,
      }),
      igrp: 14,
      sourceName: "CASE 機殼(+電源)",
      displayName: "機殼",
      sourceItemKey: "coolpc:igrp:14:ibuy:CASE-BUNDLE-PSU",
      sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=14",
    });

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-14",
      fetchedAt,
      parsedProducts: [],
      excludedIbuyTokens: ["CASE-BUNDLE-PSU"],
    });

    expect(result).toMatchObject({
      missingProductUpdatedCount: 1,
      markedInactiveProductCount: 1,
    });
    expect(client.products[0]).toMatchObject({
      isActive: false,
      missingSince: fetchedAt,
      missingSeenCount: 6,
    });
  });

  it("marks existing products missing when they are absent from a successful category parse", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");
    const presentItem = productItem({
      ibuyToken: "CPU-TOKEN-001",
      price: 4880,
      fetchedAt: previousSeenAt,
    });
    const missingItem = productItem({
      ibuyToken: "CPU-TOKEN-002",
      name: "AMD Ryzen 7 7700 old listing",
      normalizedName: "amd ryzen 7 7700 old listing",
      price: 7990,
      fetchedAt: previousSeenAt,
    });
    client.seedProductWithCurrentPrice(presentItem);
    client.seedProductWithCurrentPrice(missingItem);

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt: nextSeenAt,
      parsedProducts: [
        productItem({ ibuyToken: "CPU-TOKEN-001", price: 4880, fetchedAt: nextSeenAt }),
      ],
    });

    expect(result).toMatchObject({
      processedItemCount: 1,
      updatedProductCount: 1,
      priceUnchangedCount: 1,
      missingProductUpdatedCount: 1,
      markedInactiveProductCount: 0,
    });
    expect(client.products.find((product) => product.ibuyToken === "CPU-TOKEN-002")).toMatchObject({
      isActive: true,
      missingSince: nextSeenAt,
      missingSeenCount: 1,
      lastSeenAt: previousSeenAt,
    });
    expect(client.products).toHaveLength(2);
    expect(client.priceSnapshots).toHaveLength(2);
  });

  it("marks a product inactive on the sixth successful missing crawl", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const missingSince = new Date("2026-05-27T10:00:00.000Z");
    const fetchedAt = new Date("2026-05-27T11:00:00.000Z");
    client.seedProductWithCurrentPrice(productItem({ price: 4880 }), {
      missingSince,
      missingSeenCount: 5,
    });

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt,
      parsedProducts: [],
    });

    expect(result).toMatchObject({
      processedItemCount: 0,
      missingProductUpdatedCount: 1,
      markedInactiveProductCount: 1,
      priceSnapshotCreatedCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      isActive: false,
      missingSince,
      missingSeenCount: 6,
    });
    expect(client.priceSnapshots).toHaveLength(1);
    expect(client.currentPrices).toHaveLength(1);
  });

  it("restores an inactive product when the same source identity reappears", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");
    client.seedProductWithCurrentPrice(productItem({ price: 4880, fetchedAt: previousSeenAt }), {
      isActive: false,
      missingSince: new Date("2026-05-27T10:30:00.000Z"),
      missingSeenCount: 6,
    });

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt: nextSeenAt,
      parsedProducts: [productItem({ price: 4880, fetchedAt: nextSeenAt })],
    });

    expect(result).toMatchObject({
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 0,
      priceUnchangedCount: 1,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: nextSeenAt,
    });
    expect(client.currentPrices[0]).toMatchObject({
      priceSnapshotId: "price-snapshot-1",
      lastSeenAt: nextSeenAt,
      priceChangedAt: previousSeenAt,
    });
  });
});
