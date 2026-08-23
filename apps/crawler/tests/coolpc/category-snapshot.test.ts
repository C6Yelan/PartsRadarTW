// apps/crawler/tests/coolpc/category-snapshot.test.ts
// 驗證 category snapshot 成功分支會落 raw snapshot、判斷解析結果變更，並呼叫商品寫入流程。

import { afterEach, describe, expect, it } from "vitest";
import { processCoolpcCategorySnapshot } from "../../src/coolpc/category-snapshot";
import { CRAWL_RUN_CATEGORY_RESULT_STATUSES } from "../../src/coolpc/crawl-run";
import { RAW_SNAPSHOT_CONTENT_STATUSES } from "../../src/coolpc/raw-snapshot-writer";
import { createCategorySnapshotTestEnvironment } from "./category-snapshot-support";
import {
  category,
  createProductWriterSpy,
  FakeCrawlerWriteClient,
  snapshot,
} from "./support/category-snapshot-client";

describe("CoolPC category snapshot processor", () => {
  const testEnv = createCategorySnapshotTestEnvironment();

  afterEach(testEnv.cleanup);

  it("records a valid raw snapshot and returns success changed for importable content", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: await testEnv.fixture("cpu-category.normal.html") }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      rawSnapshotId: "raw-snapshot-1",
      productWriteSummary: {
        processedItemCount: 2,
        createdProductCount: 2,
        createdProductIds: ["product-1", "product-2"],
        updatedProductCount: 0,
        priceSnapshotCreatedCount: 2,
        priceUnchangedCount: 0,
        missingProductUpdatedCount: 0,
        markedInactiveProductCount: 0,
      },
    });
    expect(client.rawSnapshots[0]).toMatchObject({
      id: "raw-snapshot-1",
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
      parsedResultHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      compressedHtmlPath: expect.stringMatching(/^coolpc\/[a-f0-9]{64}\.html\.gz$/),
    });
    expect(productWriter.calls).toEqual([
      {
        crawlRunId: "crawl-run-1",
        rawSnapshotId: "raw-snapshot-1",
        sourceCategoryId: "category-4",
        fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
        sourceItemKeys: ["coolpc:igrp:4:ibuy:CPU-TOKEN-001", "coolpc:igrp:4:ibuy:CPU-TOKEN-002"],
        filterTags: [
          ["socket:am5", "cpu_family:ryzen-5", "integrated_graphics:no"],
          ["socket:lga1700", "cpu_family:core-i5", "integrated_graphics:yes"],
        ],
      },
    ]);
  });

  it.each([
    {
      igrp: 14,
      sourceName: "CASE機殼(+電源)",
      fixtureName: "coolpc-live-2026-08-24-igrp-14-duplicate-conflicts.html",
      itemCount: 2,
      deduplicatedItemCount: 2,
    },
    {
      igrp: 15,
      sourceName: "電源供應器",
      fixtureName: "coolpc-live-2026-08-24-igrp-15-duplicate-conflicts.html",
      itemCount: 3,
      deduplicatedItemCount: 3,
    },
  ])("imports one row per IGrp $igrp product and reports the folded count", async ({
    igrp,
    sourceName,
    fixtureName,
    itemCount,
    deduplicatedItemCount,
  }) => {
    const sourceCategory = category({
      id: `category-${igrp}`,
      igrp,
      sourceName,
      displayName: sourceName,
    });
    const client = new FakeCrawlerWriteClient([sourceCategory]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: sourceCategory,
      snapshot: snapshot({ rawHtml: await testEnv.fixture(fixtureName) }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toMatchObject({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      deduplicatedItemCount,
      productWriteSummary: { processedItemCount: itemCount },
    });
    expect(productWriter.calls).toHaveLength(1);
    expect(productWriter.calls[0]?.sourceItemKeys).toHaveLength(itemCount);
  });

  it("falls back to local tags without repeated parse errors when source-name joins are low", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();
    const rawHtml = (await testEnv.fixture("cpu-category.normal.html")).replace(
      "</section>",
      `<div class="item">
        <div class="w">CPU-TOKEN-003</div>
        <span>
          <img alt="" src="/eval/4/amd7700.jpg">
          <div class="t">AMD Ryzen 7 7700【8核/16緒】</div>
          <div class="x">含稅：NT8,990</div>
        </span>
      </div></section>`,
    );

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml }),
      sourceFilterTagsByProductName: {
        "amd ryzen 5 7500f mpk【6核/12緒】3.7g": ["socket:lga1851"],
        "stale source product 1": ["socket:am5"],
        "stale source product 2": ["socket:am5"],
      },
      writeProducts: productWriter.writeProducts,
    });

    expect(result.status).toBe(CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED);
    expect(productWriter.calls[0]?.filterTags[0]).toContain("socket:am5");
    expect(productWriter.calls[0]?.filterTags[0]).not.toContain("socket:lga1851");
    expect(result).toMatchObject({
      filterSyncJoinCoverage: { matchedCount: 1, totalCount: 3 },
    });

    await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-2",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({
        rawHtml,
        fetchedAt: new Date("2026-05-27T11:30:00.000Z"),
      }),
      sourceFilterTagsByProductName: {
        "amd ryzen 5 7500f mpk【6核/12緒】3.7g": ["socket:lga1851"],
        "stale source product 1": ["socket:am5"],
        "stale source product 2": ["socket:am5"],
      },
      writeProducts: productWriter.writeProducts,
    });
    expect(client.parseErrors).toEqual([]);
  });

  it("returns success unchanged and still refreshes product presence when parsed result hash is unchanged", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();
    const rawHtml = await testEnv.fixture("cpu-category.normal.html");

    const firstResult = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml, fetchedAt: new Date("2026-05-27T11:00:00.000Z") }),
      writeProducts: productWriter.writeProducts,
    });
    client.recordSuccessfulCategoryResult({
      crawlRunId: "crawl-run-1",
      sourceCategoryId: "category-4",
      rawSnapshotId: firstResult.rawSnapshotId ?? "",
      status: firstResult.status,
    });
    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-2",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml, fetchedAt: new Date("2026-05-27T11:05:00.000Z") }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
      rawSnapshotId: "raw-snapshot-2",
      productWriteSummary: {
        processedItemCount: 2,
        createdProductCount: 2,
        createdProductIds: ["product-1", "product-2"],
        updatedProductCount: 0,
        priceSnapshotCreatedCount: 2,
        priceUnchangedCount: 0,
        missingProductUpdatedCount: 0,
        markedInactiveProductCount: 0,
      },
    });
    expect(client.rawSnapshots).toHaveLength(2);
    expect(client.rawSnapshots[1]?.parsedResultHash).toBe(client.rawSnapshots[0]?.parsedResultHash);
    expect(productWriter.calls).toEqual([
      expect.objectContaining({
        crawlRunId: "crawl-run-1",
        rawSnapshotId: "raw-snapshot-1",
        sourceCategoryId: "category-4",
        fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
      }),
      expect.objectContaining({
        crawlRunId: "crawl-run-2",
        rawSnapshotId: "raw-snapshot-2",
        sourceCategoryId: "category-4",
        fetchedAt: new Date("2026-05-27T11:05:00.000Z"),
      }),
    ]);
  });

  it("returns success changed and writes products when parsed result hash changes", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();
    const rawHtml = await testEnv.fixture("cpu-category.normal.html");

    const firstResult = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml, fetchedAt: new Date("2026-05-27T11:00:00.000Z") }),
      writeProducts: productWriter.writeProducts,
    });
    client.recordSuccessfulCategoryResult({
      crawlRunId: "crawl-run-1",
      sourceCategoryId: "category-4",
      rawSnapshotId: firstResult.rawSnapshotId ?? "",
      status: firstResult.status,
    });
    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-2",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({
        rawHtml: rawHtml.replace("NT4880", "NT4990"),
        fetchedAt: new Date("2026-05-27T11:05:00.000Z"),
      }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      rawSnapshotId: "raw-snapshot-2",
      productWriteSummary: {
        processedItemCount: 2,
        createdProductCount: 2,
        createdProductIds: ["product-1", "product-2"],
        updatedProductCount: 0,
        priceSnapshotCreatedCount: 2,
        priceUnchangedCount: 0,
        missingProductUpdatedCount: 0,
        markedInactiveProductCount: 0,
      },
    });
    expect(client.rawSnapshots[1]?.parsedResultHash).not.toBe(
      client.rawSnapshots[0]?.parsedResultHash,
    );
    expect(productWriter.calls).toHaveLength(2);
  });
});
