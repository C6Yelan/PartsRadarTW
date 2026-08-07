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
      excludedProducts: [{ ibuyToken: "CPU-BUNDLE-BOARD", reason: "misclassified_bundle_product" }],
    });

    expect(result).toMatchObject({
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      isActive: true,
      isExcluded: true,
      exclusionReason: "misclassified_bundle_product",
      missingSince: null,
      missingSeenCount: 0,
    });
  });

  it("immediately hides an excluded bundle-only power supply from the case category", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const fetchedAt = new Date("2026-07-17T11:00:00.000Z");
    client.seedProductWithCurrentPrice(
      {
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
      },
      {
        isActive: false,
        missingSince: new Date("2026-07-17T08:39:00.000Z"),
        missingSeenCount: 6,
      },
    );

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-14",
      fetchedAt,
      parsedProducts: [],
      excludedProducts: [{ ibuyToken: "CASE-BUNDLE-PSU", reason: "misclassified_bundle_product" }],
    });

    expect(result).toMatchObject({
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      isActive: true,
      isExcluded: true,
      exclusionReason: "misclassified_bundle_product",
      missingSince: null,
      missingSeenCount: 0,
    });
  });

  it("excludes existing PSU cooling bundles without deleting price history", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const fetchedAt = new Date("2026-08-07T08:18:00.000Z");
    const products = [
      [
        "GX750-LE200-BLACK",
        "海韻 FOCUS GX-750 ATX3 金牌/全模+鈦鉭 TCOMAS LE200 360(黑)水冷 現省$2090！",
      ],
      [
        "GX750-LE200-WHITE",
        "海韻 FOCUS GX-750 ATX3(白色)金牌+鈦鉭 TCOMAS LE200 360(白)水冷 現省$2390！",
      ],
    ] as const;

    for (const [ibuyToken, name] of products) {
      client.seedProductWithCurrentPrice({
        ...productItem({
          sourceCategoryId: "category-15",
          ibuyToken,
          name,
          normalizedName: name.toLocaleLowerCase("zh-TW"),
          price: 4290,
        }),
        igrp: 15,
        sourceName: "電源供應器 PSU",
        displayName: "電源",
        sourceItemKey: `coolpc:igrp:15:ibuy:${ibuyToken}`,
        sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=15",
      });
    }

    await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-15",
      fetchedAt,
      parsedProducts: [],
      excludedProducts: products.map(([ibuyToken]) => ({
        ibuyToken,
        reason: "misclassified_bundle_product",
      })),
    });

    expect(client.products).toEqual(
      expect.arrayContaining(
        products.map(([ibuyToken]) =>
          expect.objectContaining({
            ibuyToken,
            isActive: true,
            isExcluded: true,
            exclusionReason: "misclassified_bundle_product",
          }),
        ),
      ),
    );
    expect(client.priceSnapshots).toHaveLength(2);
    expect(client.currentPrices).toHaveLength(2);
  });

  it("immediately hides an excluded conditional add-on while preserving its history", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-07-17T10:00:00.000Z");
    const fetchedAt = new Date("2026-07-17T11:00:00.000Z");
    client.seedProductWithCurrentPrice({
      ...productItem({
        sourceCategoryId: "category-5",
        ibuyToken: "CONDITIONAL-ADD-ON",
        name: '[加購優惠]買技嘉Z890主板"加購"美光 Crucial PRO 超頻32GB D5-5600',
        normalizedName: '[加購優惠]買技嘉z890主板"加購"美光 crucial pro 超頻32gb d5-5600',
        price: 1999,
        fetchedAt: previousSeenAt,
      }),
      igrp: 5,
      sourceName: "主機板 MB",
      displayName: "主機板",
      sourceItemKey: "coolpc:igrp:5:ibuy:CONDITIONAL-ADD-ON",
      sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=5",
    });

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-5",
      fetchedAt,
      parsedProducts: [],
      excludedProducts: [{ ibuyToken: "CONDITIONAL-ADD-ON", reason: "conditional_add_on" }],
    });

    expect(result).toMatchObject({
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      isActive: true,
      isExcluded: true,
      exclusionReason: "conditional_add_on",
      missingSince: null,
      missingSeenCount: 0,
    });
    expect(client.priceSnapshots).toHaveLength(1);
    expect(client.currentPrices).toHaveLength(1);
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

  it("keeps a missing product active through the first five successful crawls", async () => {
    const client = new FakeCoolpcProductWriteClient();
    client.seedProductWithCurrentPrice(productItem({ price: 4880 }));

    for (let crawlNumber = 1; crawlNumber <= 5; crawlNumber += 1) {
      await writeCoolpcCategoryProductObservation({
        client,
        crawlRunId: `crawl-run-${crawlNumber + 1}`,
        sourceCategoryId: "category-4",
        fetchedAt: new Date(Date.UTC(2026, 4, 27 + crawlNumber, 11)),
        parsedProducts: [],
      });

      expect(client.products[0]).toMatchObject({
        isActive: true,
        isExcluded: false,
        missingSeenCount: crawlNumber,
      });
    }
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

  it("restores an excluded product when the same source identity is parsed normally", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");
    client.seedProductWithCurrentPrice(productItem({ price: 4880 }), {
      isExcluded: true,
      exclusionReason: "conditional_add_on",
    });

    await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      sourceCategoryId: "category-4",
      fetchedAt: nextSeenAt,
      parsedProducts: [productItem({ price: 4880, fetchedAt: nextSeenAt })],
    });

    expect(client.products[0]).toMatchObject({
      isActive: true,
      isExcluded: false,
      exclusionReason: null,
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: nextSeenAt,
    });
  });
});
