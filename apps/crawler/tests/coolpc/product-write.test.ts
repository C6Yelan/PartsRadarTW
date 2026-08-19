// apps/crawler/tests/coolpc/product-write.test.ts
// 驗證 product-write 會正確建立與更新商品主檔、價格快照、current price 與圖片欄位。

import { describe, expect, it } from "vitest";
import { writeCoolpcCategoryProductObservation } from "../../src/coolpc/product-write";
import { FakeCoolpcProductWriteClient, productItem } from "./support/product-write-client";

describe("CoolPC category product observation writer", () => {
  it("creates product, price snapshot, and current price for a new item", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const item = productItem({ price: 4880 });

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-1",
      rawSnapshotId: "raw-snapshot-1",
      sourceCategoryId: item.sourceCategoryId,
      fetchedAt: item.fetchedAt,
      parsedProducts: [item],
    });

    expect(result).toEqual({
      processedItemCount: 1,
      createdProductCount: 1,
      createdProductIds: ["product-1"],
      updatedProductCount: 0,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.transactionCallCount).toBe(1);
    expect(client.products[0]).toMatchObject({
      id: "product-1",
      sourceCategoryId: item.sourceCategoryId,
      ibuyToken: item.ibuyToken,
      name: item.name,
      normalizedName: item.normalizedName,
      vendorSlug: item.vendorSlug,
      vendorName: item.vendorName,
      filterTags: ["socket:am5", "cpu_family:ryzen-5", "integrated_graphics:no"],
      primaryImageUrl: item.primaryImageUrl,
      primaryImageCheckedAt: item.fetchedAt,
      firstSeenAt: item.fetchedAt,
      lastSeenAt: item.fetchedAt,
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
    });
    expect(client.priceSnapshots[0]).toMatchObject({
      id: "price-snapshot-1",
      productId: "product-1",
      price: 4880,
      currency: "TWD",
      capturedAt: item.fetchedAt,
      crawlRunId: "crawl-run-1",
      rawSnapshotId: "raw-snapshot-1",
    });
    expect(client.currentPrices[0]).toMatchObject({
      productId: "product-1",
      priceSnapshotId: "price-snapshot-1",
      lastSeenAt: item.fetchedAt,
      priceChangedAt: item.fetchedAt,
    });
  });

  it("updates product fields and clears stale image diagnostics when values change", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    client.seedProductWithCurrentPrice(
      productItem({
        name: "AMD Ryzen 5 7500F old name",
        normalizedName: "amd ryzen 5 7500f old name",
        primaryImageUrl: "https://www.coolpc.com.tw/eval/4/old-image.jpg",
        price: 4880,
        fetchedAt: previousSeenAt,
      }),
    );
    Object.assign(client.products[0] ?? {}, {
      imageCachedAt: previousSeenAt,
      imageCacheCheckedAt: previousSeenAt,
      imageCacheFailureCount: 3,
      imageCacheLastError: "old failure",
      imageCacheLastErrorKind: "http",
      imageCacheLastHttpStatus: 404,
      imageCacheFailureSince: previousSeenAt,
      imageCacheLastSuccessAt: previousSeenAt,
      imageCacheNextRetryAt: previousSeenAt,
    });
    const nextItem = productItem({
      name: "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G",
      normalizedName: "amd ryzen 5 7500f mpk【6核/12緒】3.7g",
      price: 4990,
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
    });

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: nextItem.sourceCategoryId,
      fetchedAt: nextItem.fetchedAt,
      parsedProducts: [nextItem],
    });

    expect(result).toMatchObject({
      createdProductCount: 0,
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      name: nextItem.name,
      normalizedName: nextItem.normalizedName,
      vendorSlug: nextItem.vendorSlug,
      vendorName: nextItem.vendorName,
      primaryImageUrl: nextItem.primaryImageUrl,
      primaryImageCheckedAt: nextItem.fetchedAt,
      imageCachedAt: null,
      imageCacheCheckedAt: null,
      imageCacheFailureCount: 0,
      imageCacheLastError: null,
      imageCacheLastErrorKind: null,
      imageCacheLastHttpStatus: null,
      imageCacheFailureSince: null,
      imageCacheLastSuccessAt: null,
      imageCacheNextRetryAt: null,
      lastSeenAt: nextItem.fetchedAt,
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
    });
    expect(client.priceSnapshots).toHaveLength(2);
    expect(client.priceSnapshots[1]).toMatchObject({
      id: "price-snapshot-2",
      price: 4990,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
    });
    expect(client.currentPrices[0]).toMatchObject({
      priceSnapshotId: "price-snapshot-2",
      lastSeenAt: nextItem.fetchedAt,
      priceChangedAt: nextItem.fetchedAt,
    });
  });

  it("does not create duplicate price snapshots when price is unchanged", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    const previousItem = productItem({ price: 4880, fetchedAt: previousSeenAt });
    client.seedProductWithCurrentPrice(previousItem);
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: previousItem.sourceCategoryId,
      fetchedAt: nextSeenAt,
      parsedProducts: [productItem({ price: 4880, fetchedAt: nextSeenAt })],
    });

    expect(result).toMatchObject({
      createdProductCount: 0,
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 0,
      priceUnchangedCount: 1,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.priceSnapshots).toHaveLength(1);
    expect(client.currentPrices[0]).toMatchObject({
      priceSnapshotId: "price-snapshot-1",
      lastSeenAt: nextSeenAt,
      priceChangedAt: previousSeenAt,
    });
    expect(client.products[0]?.lastSeenAt).toEqual(nextSeenAt);
  });

  it("continues an old product identity when only the encoded name token changes", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-08-19T12:32:00.000Z");
    client.seedProductWithCurrentPrice(
      productItem({
        ibuyToken: "old-name-token",
        name: "華碩 PRO WS W680-ACE(ATX/DDR5)",
        normalizedName: "華碩 pro ws w680-ace(atx/ddr5)",
        price: 12990,
        fetchedAt: previousSeenAt,
      }),
    );
    const fetchedAt = new Date("2026-08-19T13:02:00.000Z");
    const renamedItem = productItem({
      ibuyToken: "new-name-token",
      name: "｛華碩 PRO WS W680-ACE｝ATX/DDR5",
      normalizedName: "｛華碩 pro ws w680-ace｝atx/ddr5",
      price: 12990,
      fetchedAt,
    });

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      sourceCategoryId: renamedItem.sourceCategoryId,
      fetchedAt,
      parsedProducts: [renamedItem],
    });

    expect(result).toMatchObject({
      createdProductCount: 0,
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 0,
      priceUnchangedCount: 1,
      missingProductUpdatedCount: 0,
    });
    expect(client.products).toHaveLength(1);
    expect(client.products[0]).toMatchObject({
      id: "product-1",
      ibuyToken: "new-name-token",
      name: renamedItem.name,
      lastSeenAt: fetchedAt,
      missingSeenCount: 0,
    });
  });

  it("refreshes filter tags when a product name changes without a price change", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousItem = productItem({
      name: "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G",
      normalizedName: "amd ryzen 5 7500f mpk【6核/12緒】3.7g",
      price: 4880,
    });
    client.seedProductWithCurrentPrice(previousItem);
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");
    const nextItem = productItem({
      name: "AMD R7 9700X【8核/16緒】3.8G / 具內顯",
      normalizedName: "amd r7 9700x【8核/16緒】3.8g / 具內顯",
      price: 4880,
      fetchedAt: nextSeenAt,
    });

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      sourceCategoryId: nextItem.sourceCategoryId,
      fetchedAt: nextSeenAt,
      parsedProducts: [nextItem],
    });

    expect(result.priceSnapshotCreatedCount).toBe(0);
    expect(client.products[0]?.filterTags).toEqual([
      "socket:am5",
      "cpu_family:ryzen-7",
      "integrated_graphics:yes",
    ]);
  });

  it("preserves an existing primary image when the latest parsed item has no valid image URL", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    const previousImageUrl = "https://www.coolpc.com.tw/eval/4/amd7500f.jpg";
    const previousItem = productItem({
      price: 4880,
      primaryImageUrl: previousImageUrl,
      fetchedAt: previousSeenAt,
    });
    client.seedProductWithCurrentPrice(previousItem);
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: previousItem.sourceCategoryId,
      fetchedAt: nextSeenAt,
      parsedProducts: [
        productItem({
          price: 4880,
          primaryImageUrl: null,
          fetchedAt: nextSeenAt,
        }),
      ],
    });

    expect(result).toMatchObject({
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 0,
      priceUnchangedCount: 1,
    });
    expect(client.products[0]).toMatchObject({
      primaryImageUrl: previousImageUrl,
      primaryImageCheckedAt: previousSeenAt,
      lastSeenAt: nextSeenAt,
    });
  });

  it("recreates current price when an existing product has no current price row", async () => {
    const client = new FakeCoolpcProductWriteClient();
    client.seedProductWithoutCurrentPrice(productItem({ price: 4880 }));
    const fetchedAt = new Date("2026-05-27T11:00:00.000Z");

    const result = await writeCoolpcCategoryProductObservation({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt,
      parsedProducts: [productItem({ price: 4880, fetchedAt })],
    });

    expect(result).toMatchObject({
      createdProductCount: 0,
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.priceSnapshots).toHaveLength(1);
    expect(client.currentPrices).toHaveLength(1);
    expect(client.currentPrices[0]?.priceSnapshotId).toBe("price-snapshot-1");
  });
});
