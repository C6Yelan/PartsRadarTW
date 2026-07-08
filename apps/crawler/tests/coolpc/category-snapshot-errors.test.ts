// apps/crawler/tests/coolpc/category-snapshot-errors.test.ts
// 驗證 category snapshot 錯誤分支會正確落 raw snapshot、parse error，並避免寫入商品資料。

import { afterEach, describe, expect, it } from "vitest";
import { CRAWL_RUN_CATEGORY_RESULT_STATUSES } from "../../src/coolpc/crawl-run";
import { processCoolpcCategorySnapshot } from "../../src/coolpc/category-snapshot";
import { RAW_SNAPSHOT_CONTENT_STATUSES } from "../../src/coolpc/raw-snapshot-writer";
import { createCategorySnapshotTestEnvironment } from "./category-snapshot-support";
import {
  category,
  createProductWriterSpy,
  FakeCrawlerWriteClient,
  snapshot,
} from "./support/category-snapshot-client";

describe("CoolPC category snapshot error handling", () => {
  const testEnv = createCategorySnapshotTestEnvironment();

  afterEach(testEnv.cleanup);

  it("records invalid content as parse failed with a raw snapshot id", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: await testEnv.fixture("cpu-category.missing-token.html") }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED,
      rawSnapshotId: "raw-snapshot-1",
      errorMessage: "missing_required_product_structure",
    });
    expect(client.rawSnapshots[0]?.contentStatus).toBe(RAW_SNAPSHOT_CONTENT_STATUSES.INVALID);
    expect(client.parseErrors).toEqual([
      expect.objectContaining({
        crawlRunId: "crawl-run-1",
        rawSnapshotId: "raw-snapshot-1",
        sourceCategoryId: "category-4",
        errorType: "CONTENT_VALIDATION_FAILED",
        message: "missing_required_product_structure",
        rawImageUrl: null,
      }),
    ]);
    expect(productWriter.calls).toEqual([]);
  });

  it("records invalid image URL parse errors with their raw image URL", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: await testEnv.fixture("cpu-category.invalid-image.html") }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      rawSnapshotId: "raw-snapshot-1",
      productWriteSummary: {
        processedItemCount: 3,
        createdProductCount: 3,
        createdProductIds: ["product-1", "product-2", "product-3"],
        updatedProductCount: 0,
        priceSnapshotCreatedCount: 3,
        priceUnchangedCount: 0,
        missingProductUpdatedCount: 0,
        markedInactiveProductCount: 0,
      },
    });
    expect(client.parseErrors).toEqual([
      expect.objectContaining({
        crawlRunId: "crawl-run-1",
        rawSnapshotId: "raw-snapshot-1",
        sourceCategoryId: "category-4",
        errorType: "INVALID_IMAGE_URL",
        rawToken: "CPU-TOKEN-002",
        rawImageUrl: "/eval/4/",
      }),
      expect.objectContaining({
        crawlRunId: "crawl-run-1",
        rawSnapshotId: "raw-snapshot-1",
        sourceCategoryId: "category-4",
        errorType: "INVALID_IMAGE_URL",
        rawToken: "CPU-TOKEN-003",
        rawImageUrl: "https://example.com/product.jpg",
      }),
    ]);
    expect(productWriter.calls).toEqual([
      expect.objectContaining({
        crawlRunId: "crawl-run-1",
        rawSnapshotId: "raw-snapshot-1",
        sourceCategoryId: "category-4",
        sourceItemKeys: [
          "coolpc:igrp:4:ibuy:CPU-TOKEN-001",
          "coolpc:igrp:4:ibuy:CPU-TOKEN-002",
          "coolpc:igrp:4:ibuy:CPU-TOKEN-003",
        ],
      }),
    ]);
  });

  it("records non-product content as suspected block", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: await testEnv.fixture("http-200.non-product.html") }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK,
      rawSnapshotId: "raw-snapshot-1",
      errorMessage: "not_expected_category_page",
    });
    expect(client.rawSnapshots[0]?.contentStatus).toBe(
      RAW_SNAPSHOT_CONTENT_STATUSES.SUSPECTED_BLOCK,
    );
    expect(productWriter.calls).toEqual([]);
  });

  it("records fetch failures without requiring raw HTML", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await testEnv.createStorageDir();
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: null, fetchError: "Fetch timed out.", httpStatus: null }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED,
      rawSnapshotId: "raw-snapshot-1",
      errorMessage: "Fetch timed out.",
    });
    expect(client.rawSnapshots[0]).toMatchObject({
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.INVALID,
      fetchError: "Fetch timed out.",
      compressedHtmlPath: null,
    });
    expect(productWriter.calls).toEqual([]);
  });
});
