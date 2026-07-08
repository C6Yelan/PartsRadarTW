// apps/crawler/tests/coolpc/data-flow.test.ts
// 驗證 CoolPC crawler 從 raw snapshot 到商品、價格、缺漏與恢復狀態的跨模組資料流。

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CRAWL_RUN_CATEGORY_RESULT_STATUSES, CRAWL_RUN_STATUSES } from "../../src/coolpc/crawl-run";
import { RAW_SNAPSHOT_CONTENT_STATUSES } from "../../src/coolpc/raw-snapshot-writer";
import {
  category,
  currentPriceByToken,
  FakeCoolpcDataFlowClient,
  keepOnlyFirstProduct,
  last,
  productByToken,
  runSnapshot,
} from "./support/data-flow-client";

const fixtureDir = join(__dirname, "fixtures");

describe("CoolPC crawler data flow", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("creates products on first sighting and refreshes unchanged successful crawls without duplicate history", async () => {
    const client = new FakeCoolpcDataFlowClient([category()]);
    const storageDir = await createTempDir(tempDirs);
    const rawHtml = await fixture("cpu-category.normal.html");
    const firstSeenAt = new Date("2026-05-27T11:00:00.000Z");
    const secondSeenAt = new Date("2026-05-27T11:05:00.000Z");

    const firstRun = await runSnapshot({ client, storageDir, rawHtml, fetchedAt: firstSeenAt });
    const secondRun = await runSnapshot({ client, storageDir, rawHtml, fetchedAt: secondSeenAt });

    expect(firstRun.status).toBe(CRAWL_RUN_STATUSES.SUCCESS_CHANGED);
    expect(secondRun.status).toBe(CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED);
    expect(client.categoryResults.map((result) => result.status)).toEqual([
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
    ]);
    expect(client.rawSnapshots[1]).toMatchObject({
      contentHash: client.rawSnapshots[0]?.contentHash,
      compressedHtmlPath: client.rawSnapshots[0]?.compressedHtmlPath,
      duplicateOfSnapshotId: "raw-snapshot-1",
    });
    expect(await readdir(join(storageDir, "coolpc"))).toHaveLength(1);

    expect(client.products).toHaveLength(2);
    expect(client.priceSnapshots).toHaveLength(2);
    expect(client.currentPrices).toHaveLength(2);
    expect(productByToken(client, "CPU-TOKEN-001")).toMatchObject({
      isActive: true,
      vendorSlug: "amd",
      vendorName: "AMD",
      primaryImageUrl: "https://www.coolpc.com.tw/eval/4/amd7500f.jpg",
      primaryImageCheckedAt: secondSeenAt,
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: secondSeenAt,
    });
    expect(productByToken(client, "CPU-TOKEN-002")).toMatchObject({
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: secondSeenAt,
    });
    expect(client.sourceCategoryUpdates[1]).toMatchObject({
      sourceCategoryId: "category-4",
      lastCheckedAt: secondSeenAt,
      lastSuccessAt: secondSeenAt,
      updatedLastSuccessAt: true,
    });
  });

  it("adds only the changed price snapshot and keeps current prices pointing at product-owned history", async () => {
    const client = new FakeCoolpcDataFlowClient([category()]);
    const storageDir = await createTempDir(tempDirs);
    const rawHtml = await fixture("cpu-category.normal.html");
    const changedPriceHtml = rawHtml.replace("NT4880", "NT4990");

    await runSnapshot({
      client,
      storageDir,
      rawHtml,
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
    });
    const changedRun = await runSnapshot({
      client,
      storageDir,
      rawHtml: changedPriceHtml,
      fetchedAt: new Date("2026-05-27T11:05:00.000Z"),
    });

    expect(changedRun.status).toBe(CRAWL_RUN_STATUSES.SUCCESS_CHANGED);
    expect(client.rawSnapshots[1]).toMatchObject({
      duplicateOfSnapshotId: null,
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
    });
    expect(client.rawSnapshots[1]?.contentHash).not.toBe(client.rawSnapshots[0]?.contentHash);
    expect(client.priceSnapshots).toHaveLength(3);
    expect(client.priceSnapshots[2]).toMatchObject({
      id: "price-snapshot-3",
      productId: productByToken(client, "CPU-TOKEN-001").id,
      price: 4990,
    });
    expect(currentPriceByToken(client, "CPU-TOKEN-001")).toMatchObject({
      priceSnapshotId: "price-snapshot-3",
      priceChangedAt: new Date("2026-05-27T11:05:00.000Z"),
    });
    expect(currentPriceByToken(client, "CPU-TOKEN-002")).toMatchObject({
      priceSnapshotId: "price-snapshot-2",
      priceChangedAt: new Date("2026-05-27T11:00:00.000Z"),
    });
  });

  it("does not update products, prices, or missing counters on parse failures and suspected blocks", async () => {
    const client = new FakeCoolpcDataFlowClient([category()]);
    const storageDir = await createTempDir(tempDirs);

    await runSnapshot({
      client,
      storageDir,
      rawHtml: await fixture("cpu-category.normal.html"),
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
    });
    const parseFailedRun = await runSnapshot({
      client,
      storageDir,
      rawHtml: await fixture("cpu-category.missing-token.html"),
      fetchedAt: new Date("2026-05-27T11:05:00.000Z"),
    });
    const suspectedBlockRun = await runSnapshot({
      client,
      storageDir,
      rawHtml: await fixture("http-200.non-product.html"),
      fetchedAt: new Date("2026-05-27T11:10:00.000Z"),
    });

    expect(parseFailedRun.status).toBe(CRAWL_RUN_STATUSES.PARSE_FAILED);
    expect(suspectedBlockRun).toMatchObject({
      status: CRAWL_RUN_STATUSES.SUSPECTED_BLOCK,
      stoppedBySuspectedBlock: true,
    });
    expect(client.categoryResults.map((result) => result.status)).toEqual([
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK,
    ]);
    expect(client.rawSnapshots.map((snapshot) => snapshot.contentStatus)).toEqual([
      RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
      RAW_SNAPSHOT_CONTENT_STATUSES.INVALID,
      RAW_SNAPSHOT_CONTENT_STATUSES.SUSPECTED_BLOCK,
    ]);
    expect(client.products).toHaveLength(2);
    expect(client.priceSnapshots).toHaveLength(2);
    expect(productByToken(client, "CPU-TOKEN-001")).toMatchObject({
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: new Date("2026-05-27T11:00:00.000Z"),
    });
    expect(productByToken(client, "CPU-TOKEN-002")).toMatchObject({
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: new Date("2026-05-27T11:00:00.000Z"),
    });
    expect(last(client.sourceCategoryUpdates)).toMatchObject({
      lastCheckedAt: new Date("2026-05-27T11:10:00.000Z"),
      lastSuccessAt: undefined,
      updatedLastSuccessAt: false,
    });
    expect(client.sourceCategories[0]).toMatchObject({
      lastCheckedAt: new Date("2026-05-27T11:10:00.000Z"),
      lastSuccessAt: new Date("2026-05-27T11:00:00.000Z"),
    });
  });

  it("marks products inactive after six successful misses and restores them when they reappear", async () => {
    const client = new FakeCoolpcDataFlowClient([category()]);
    const storageDir = await createTempDir(tempDirs);
    const rawHtml = await fixture("cpu-category.normal.html");
    const missingSecondProductHtml = keepOnlyFirstProduct(rawHtml);
    const missingDates = [
      new Date("2026-05-27T11:05:00.000Z"),
      new Date("2026-05-27T11:10:00.000Z"),
      new Date("2026-05-27T11:15:00.000Z"),
      new Date("2026-05-27T11:20:00.000Z"),
      new Date("2026-05-27T11:25:00.000Z"),
      new Date("2026-05-27T11:30:00.000Z"),
    ];

    await runSnapshot({
      client,
      storageDir,
      rawHtml,
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
    });

    for (const fetchedAt of missingDates) {
      await runSnapshot({ client, storageDir, rawHtml: missingSecondProductHtml, fetchedAt });
    }

    expect(client.categoryResults.map((result) => result.status)).toEqual([
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
      CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
    ]);
    expect(productByToken(client, "CPU-TOKEN-001")).toMatchObject({
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: missingDates[5],
    });
    expect(productByToken(client, "CPU-TOKEN-002")).toMatchObject({
      isActive: false,
      missingSince: missingDates[0],
      missingSeenCount: 6,
      lastSeenAt: new Date("2026-05-27T11:00:00.000Z"),
    });
    expect(client.priceSnapshots).toHaveLength(2);

    await runSnapshot({
      client,
      storageDir,
      rawHtml,
      fetchedAt: new Date("2026-05-27T11:35:00.000Z"),
    });

    expect(last(client.categoryResults)).toMatchObject({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
    });
    expect(last(client.rawSnapshots)).toMatchObject({
      duplicateOfSnapshotId: "raw-snapshot-1",
    });
    expect(productByToken(client, "CPU-TOKEN-002")).toMatchObject({
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: new Date("2026-05-27T11:35:00.000Z"),
    });
    expect(currentPriceByToken(client, "CPU-TOKEN-002")).toMatchObject({
      priceSnapshotId: "price-snapshot-2",
      lastSeenAt: new Date("2026-05-27T11:35:00.000Z"),
      priceChangedAt: new Date("2026-05-27T11:00:00.000Z"),
    });
    expect(client.priceSnapshots).toHaveLength(2);
  });
});

async function fixture(name: string): Promise<string> {
  return readFile(join(fixtureDir, name), "utf8");
}

async function createTempDir(tempDirs: string[]): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "partsradar-data-flow-"));
  tempDirs.push(tempDir);
  return tempDir;
}
