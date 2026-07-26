// packages/db/tests/price-report/reader.integration.test.ts
// 以 disposable PostgreSQL 驗證 price report readers 的查詢、排序與篩選語意。

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readCrawlRunPriceChangeSummary, readRecentPriceReport } from "../../src/price-report";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");
}

const categoryIds = new Set<string>();
const productIds = new Set<string>();
const crawlRunIds = new Set<string>();
const snapshotIds = new Set<string>();
let nextIgrp = 1_000_000 + Math.floor(Math.random() * 1_000_000);
let client: PrismaClient;

beforeAll(() => {
  client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
  });
});

afterEach(async () => {
  await client.priceSnapshot.deleteMany({ where: { id: { in: [...snapshotIds] } } });
  await client.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await client.crawlRun.deleteMany({ where: { id: { in: [...crawlRunIds] } } });
  await client.sourceCategory.deleteMany({ where: { id: { in: [...categoryIds] } } });
  snapshotIds.clear();
  productIds.clear();
  crawlRunIds.clear();
  categoryIds.clear();
});

afterAll(async () => {
  await client.$disconnect();
});

describe("price report readers PostgreSQL integration", () => {
  it("excludes disabled categories and excluded products from recent and crawl-run reports", async () => {
    const baselineRunId = await createCrawlRun("2030-01-01T00:00:00.000Z");
    const changedRunId = await createCrawlRun("2030-01-02T12:00:00.000Z");
    const enabledProductId = await createProductWithHistory({
      name: "Enabled integration GPU",
      baselineRunId,
      changedRunId,
    });
    await createProductWithHistory({
      name: "Disabled integration GPU",
      baselineRunId,
      changedRunId,
      categoryEnabled: false,
    });
    await createProductWithHistory({
      name: "Excluded integration GPU",
      baselineRunId,
      changedRunId,
      isExcluded: true,
    });

    const recent = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: { includeNewProducts: false },
    });
    const crawlRun = await readCrawlRunPriceChangeSummary(client, changedRunId);

    expect(recent.priceChanges.map(({ productId }) => productId)).toEqual([enabledProductId]);
    expect(recent.newProducts).toEqual([]);
    expect(crawlRun.changes.map(({ productId }) => productId)).toEqual([enabledProductId]);
    expect(crawlRun.newProducts).toEqual([]);
    expect(crawlRun.snapshotCount).toBe(1);
  });

  it("uses the latest baseline and latest in-window snapshot for one product", async () => {
    const productId = await createProduct({
      name: "Multi-snapshot integration GPU",
      categoryId: await createCategory(),
    });
    const oldestRunId = await createCrawlRun("2030-01-01T00:00:00.000Z");
    const baselineRunId = await createCrawlRun("2030-01-01T23:00:00.000Z");
    const firstWindowRunId = await createCrawlRun("2030-01-02T01:00:00.000Z");
    const latestWindowRunId = await createCrawlRun("2030-01-02T02:00:00.000Z");

    await createSnapshot(productId, oldestRunId, 12_000, "2030-01-01T00:00:00.000Z");
    await createSnapshot(productId, baselineRunId, 11_000, "2030-01-01T23:00:00.000Z");
    await createSnapshot(productId, firstWindowRunId, 10_000, "2030-01-02T01:00:00.000Z");
    await createSnapshot(productId, latestWindowRunId, 9_000, "2030-01-02T02:00:00.000Z");

    const report = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: { includeNewProducts: false },
    });

    expect(report.priceChanges).toEqual([
      expect.objectContaining({
        productId,
        previousPrice: 10_000,
        currentPrice: 9_000,
        changedAt: new Date("2030-01-02T02:00:00.000Z"),
        delta: -1_000,
      }),
    ]);
  });

  it("selects the latest pre-window baseline by capturedAt and id descending", async () => {
    const productId = await createProduct({
      name: "Baseline ordering integration GPU",
      categoryId: await createCategory(),
    });
    const olderRunId = await createCrawlRun("2030-01-01T20:00:00.000Z");
    const tiedBaselineRunId = await createCrawlRun("2030-01-01T23:00:00.000Z");
    const windowRunId = await createCrawlRun("2030-01-02T02:00:00.000Z");

    await createSnapshot(productId, olderRunId, 12_000, "2030-01-01T20:00:00.000Z");
    await createSnapshot(productId, tiedBaselineRunId, 11_000, "2030-01-01T23:00:00.000Z", {
      id: "30000000-0000-4000-8000-000000000001",
    });
    await createSnapshot(productId, tiedBaselineRunId, 10_500, "2030-01-01T23:00:00.000Z", {
      id: "30000000-0000-4000-8000-000000000002",
    });
    await createSnapshot(productId, windowRunId, 9_000, "2030-01-02T02:00:00.000Z");

    const report = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: { includeNewProducts: false },
    });

    expect(report.priceChanges).toEqual([
      expect.objectContaining({
        productId,
        previousPrice: 10_500,
        currentPrice: 9_000,
        delta: -1_500,
      }),
    ]);
  });

  it("applies keyword token groups and category filters with PostgreSQL semantics", async () => {
    const baselineRunId = await createCrawlRun("2030-01-01T00:00:00.000Z");
    const changedRunId = await createCrawlRun("2030-01-02T12:00:00.000Z");
    const gpuIgrp = nextCategoryIgrp();
    const memoryIgrp = nextCategoryIgrp();
    const gpuCategoryId = await createCategory({ igrp: gpuIgrp });
    const memoryCategoryId = await createCategory({ igrp: memoryIgrp });
    const rtx5090Id = await createProductWithHistory({
      name: "華碩 ROG RTX 5090 測試卡",
      categoryId: gpuCategoryId,
      baselineRunId,
      changedRunId,
    });
    await createProductWithHistory({
      name: "微星 RTX 5080 測試卡",
      categoryId: gpuCategoryId,
      baselineRunId,
      changedRunId,
    });
    const ddr5Id = await createProductWithHistory({
      name: "芝奇 DDR5 6400 記憶體",
      categoryId: memoryCategoryId,
      baselineRunId,
      changedRunId,
    });

    const keywordReport = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: {
        categoryIgrps: [gpuIgrp, memoryIgrp],
        productKeyword: "rtx 5090, ddr5",
        includeNewProducts: false,
      },
    });
    const gpuOnlyReport = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: {
        categoryIgrps: [gpuIgrp],
        productKeyword: "rtx 5090, ddr5",
        includeNewProducts: false,
      },
    });

    expect(keywordReport.priceChanges.map(({ productId }) => productId).sort()).toEqual(
      [rtx5090Id, ddr5Id].sort(),
    );
    expect(gpuOnlyReport.priceChanges.map(({ productId }) => productId)).toEqual([rtx5090Id]);
  });
});

async function createProductWithHistory({
  name,
  baselineRunId,
  changedRunId,
  categoryEnabled = true,
  categoryIgrp = nextCategoryIgrp(),
  categoryId,
  isExcluded = false,
}: {
  name: string;
  baselineRunId: string;
  changedRunId: string;
  categoryEnabled?: boolean;
  categoryIgrp?: number;
  categoryId?: string;
  isExcluded?: boolean;
}) {
  const resolvedCategoryId =
    categoryId ?? (await createCategory({ enabled: categoryEnabled, igrp: categoryIgrp }));
  const productId = await createProduct({ name, categoryId: resolvedCategoryId, isExcluded });
  await createSnapshot(productId, baselineRunId, 10_000, "2030-01-01T00:00:00.000Z");
  await createSnapshot(productId, changedRunId, 9_000, "2030-01-02T12:00:00.000Z");
  return productId;
}

async function createCategory({
  enabled = true,
  igrp = nextCategoryIgrp(),
}: {
  enabled?: boolean;
  igrp?: number;
} = {}) {
  const id = randomUUID();
  categoryIds.add(id);
  await client.sourceCategory.create({
    data: {
      id,
      igrp,
      sourceName: `Integration category ${igrp}`,
      displayName: `Integration category ${igrp}`,
      enabled,
    },
  });
  return id;
}

async function createProduct({
  name,
  categoryId,
  isExcluded = false,
}: {
  name: string;
  categoryId: string;
  isExcluded?: boolean;
}) {
  const id = randomUUID();
  productIds.add(id);
  await client.product.create({
    data: {
      id,
      sourceCategoryId: categoryId,
      ibuyToken: `integration-${id}`,
      name,
      normalizedName: name.toLocaleLowerCase(),
      sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=12",
      isExcluded,
      firstSeenAt: new Date("2030-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2030-01-02T12:00:00.000Z"),
    },
  });
  return id;
}

async function createCrawlRun(at: string) {
  const id = randomUUID();
  crawlRunIds.add(id);
  await client.crawlRun.create({
    data: {
      id,
      status: "SUCCESS_CHANGED",
      triggerType: "MANUAL",
      startedAt: new Date(at),
      finishedAt: new Date(at),
    },
  });
  return id;
}

async function createSnapshot(
  productId: string,
  crawlRunId: string,
  price: number,
  at: string,
  { id = randomUUID() }: { id?: string } = {},
) {
  snapshotIds.add(id);
  await client.priceSnapshot.create({
    data: {
      id,
      productId,
      price,
      capturedAt: new Date(at),
      crawlRunId,
    },
  });
}

function nextCategoryIgrp() {
  nextIgrp += 1;
  return nextIgrp;
}
