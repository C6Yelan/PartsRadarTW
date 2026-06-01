import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  runCoolpcCrawlOnce,
} from "../../src/coolpc/crawl-run";
import { processCoolpcCategorySnapshot } from "../../src/coolpc/category-snapshot";
import { RAW_SNAPSHOT_CONTENT_STATUSES } from "../../src/coolpc/raw-snapshot-writer";
import {
  category,
  createProductWriterSpy,
  FakeCrawlerWriteClient,
  fixedClock,
  snapshot,
} from "./support/category-snapshot-client";

const fixtureDir = join(__dirname, "fixtures");

describe("CoolPC category snapshot processor", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("records a valid raw snapshot and returns success changed for importable content", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await createTempDir(tempDirs);
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: await fixture("cpu-category.normal.html") }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      rawSnapshotId: "raw-snapshot-1",
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
      },
    ]);
  });

  it("returns success unchanged and still refreshes product presence when parsed result hash is unchanged", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await createTempDir(tempDirs);
    const productWriter = createProductWriterSpy();
    const rawHtml = await fixture("cpu-category.normal.html");

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
    const storageDir = await createTempDir(tempDirs);
    const productWriter = createProductWriterSpy();
    const rawHtml = await fixture("cpu-category.normal.html");

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
    });
    expect(client.rawSnapshots[1]?.parsedResultHash).not.toBe(
      client.rawSnapshots[0]?.parsedResultHash,
    );
    expect(productWriter.calls).toHaveLength(2);
  });

  it("records invalid content as parse failed with a raw snapshot id", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await createTempDir(tempDirs);
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: await fixture("cpu-category.missing-token.html") }),
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
    const storageDir = await createTempDir(tempDirs);
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: await fixture("cpu-category.invalid-image.html") }),
      writeProducts: productWriter.writeProducts,
    });

    expect(result).toEqual({
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      rawSnapshotId: "raw-snapshot-1",
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
        sourceItemKeys: ["coolpc:igrp:4:ibuy:CPU-TOKEN-001"],
      }),
    ]);
  });

  it("records non-product content as suspected block", async () => {
    const client = new FakeCrawlerWriteClient([category({ id: "category-4", igrp: 4 })]);
    const storageDir = await createTempDir(tempDirs);
    const productWriter = createProductWriterSpy();

    const result = await processCoolpcCategorySnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      category: category({ id: "category-4", igrp: 4 }),
      snapshot: snapshot({ rawHtml: await fixture("http-200.non-product.html") }),
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
    const storageDir = await createTempDir(tempDirs);
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

  it("passes raw snapshot ids into crawl run category results and stops on suspected block", async () => {
    const client = new FakeCrawlerWriteClient([
      category({ id: "category-4", igrp: 4 }),
      category({ id: "category-5", igrp: 5, displayName: "主機板", sourceName: "主機板 MB" }),
    ]);
    const storageDir = await createTempDir(tempDirs);
    const suspectedBlockHtml = await fixture("http-200.non-product.html");
    const productWriter = createProductWriterSpy();

    const result = await runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: ({ crawlRunId, category: sourceCategory }) =>
        processCoolpcCategorySnapshot({
          client,
          storageDir,
          crawlRunId,
          category: sourceCategory,
          snapshot: snapshot({ rawHtml: suspectedBlockHtml }),
          writeProducts: productWriter.writeProducts,
        }),
    });

    expect(result.status).toBe(CRAWL_RUN_STATUSES.SUSPECTED_BLOCK);
    expect(result.stoppedBySuspectedBlock).toBe(true);
    expect(result.categoryResults).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK,
        rawSnapshotId: "raw-snapshot-1",
      }),
    ]);
    expect(client.categoryResults).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        rawSnapshotId: "raw-snapshot-1",
      }),
    ]);
    expect(client.rawSnapshots).toHaveLength(1);
    expect(productWriter.calls).toEqual([]);
  });
});

async function fixture(name: string): Promise<string> {
  return readFile(join(fixtureDir, name), "utf8");
}

async function createTempDir(tempDirs: string[]): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "partsradar-category-snapshot-"));
  tempDirs.push(tempDir);
  return tempDir;
}
