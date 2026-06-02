// apps/crawler/tests/coolpc/product-write.test.ts
import { describe, expect, it } from "vitest";
import { writeCoolpcProductPrices } from "../../src/coolpc/product-write";
import { FakeCoolpcProductWriteClient, productItem } from "./support/product-write-client";

describe("CoolPC product price writer", () => {
  it("creates product, price snapshot, and current price for a new item", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const item = productItem({ price: 4880 });

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-1",
      rawSnapshotId: "raw-snapshot-1",
      sourceCategoryId: item.sourceCategoryId,
      fetchedAt: item.fetchedAt,
      items: [item],
    });

    expect(result).toEqual({
      processedItemCount: 1,
      createdProductCount: 1,
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
      primaryImageUrl: item.primaryImageUrl,
      primaryImageCheckedAt: item.fetchedAt,
      introductionUrl: item.introductionUrl,
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

  it("updates product identity fields and creates a new price snapshot when price changes", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    client.seedProductWithCurrentPrice(
      productItem({
        name: "AMD Ryzen 5 7500F old name",
        normalizedName: "amd ryzen 5 7500f old name",
        price: 4880,
        fetchedAt: previousSeenAt,
      }),
    );
    const nextItem = productItem({
      name: "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G",
      normalizedName: "amd ryzen 5 7500f mpk【6核/12緒】3.7g",
      price: 4990,
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
    });

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: nextItem.sourceCategoryId,
      fetchedAt: nextItem.fetchedAt,
      items: [nextItem],
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
      introductionUrl: nextItem.introductionUrl,
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

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: previousItem.sourceCategoryId,
      fetchedAt: nextSeenAt,
      items: [productItem({ price: 4880, fetchedAt: nextSeenAt })],
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

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: previousItem.sourceCategoryId,
      fetchedAt: nextSeenAt,
      items: [
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

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt,
      items: [productItem({ price: 4880, fetchedAt })],
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

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt: nextSeenAt,
      items: [productItem({ ibuyToken: "CPU-TOKEN-001", price: 4880, fetchedAt: nextSeenAt })],
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

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt,
      items: [],
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

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt: nextSeenAt,
      items: [productItem({ price: 4880, fetchedAt: nextSeenAt })],
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
