import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  runCoolpcCrawlOnce,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunSourceCategory,
  type CrawlRunStatusValue,
  type CrawlRunWriteClient,
} from "./crawl-run";
import {
  type CoolpcCategorySnapshotWriteClient,
  type WriteCoolpcCategoryProducts,
  processCoolpcCategorySnapshot,
} from "./category-snapshot";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  type RawSnapshotContentStatusValue,
  type RawSnapshotWriteClient,
} from "./raw-snapshot";

const fixtureDir = join(__dirname, "__fixtures__");

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
        sourceItemKeys: [
          "coolpc:igrp:4:ibuy:CPU-TOKEN-001",
          "coolpc:igrp:4:ibuy:CPU-TOKEN-002",
        ],
      },
    ]);
  });

  it("returns success unchanged and skips product writes when parsed result hash is unchanged", async () => {
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
    expect(productWriter.calls).toHaveLength(1);
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
    expect(productWriter.calls).toEqual([]);
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

interface FakeCrawlRun {
  id: string;
  status: CrawlRunStatusValue;
  startedAt: Date;
  finishedAt: Date | null;
}

interface FakeCategoryResult {
  id: string;
  crawlRunId: string;
  sourceCategoryId: string;
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string | null;
  errorMessage: string | null;
}

interface FakeRawSnapshot {
  id: string;
  crawlRunId: string;
  sourceCategoryId: string;
  url: string;
  fetchedAt: Date;
  httpStatus: number | null;
  fetchError: string | null;
  contentStatus: RawSnapshotContentStatusValue;
  contentHash: string | null;
  parsedResultHash: string | null;
  compressedHtmlPath: string | null;
  duplicateOfSnapshotId: string | null;
  createdAt: Date;
}

// The fake implements only the Prisma delegate methods touched by this slice.
// That keeps the tests focused on the crawler write contract without requiring
// a test database.
class FakeCrawlerWriteClient implements CrawlRunWriteClient, CoolpcCategorySnapshotWriteClient {
  readonly crawlRuns: FakeCrawlRun[] = [];
  readonly categoryResults: FakeCategoryResult[] = [];
  readonly rawSnapshots: FakeRawSnapshot[] = [];

  constructor(private readonly categories: CrawlRunSourceCategory[]) {}

  sourceCategory = {
    // Mirror the production query shape: enabled categories in source order.
    findMany: async () =>
      [...this.categories]
        .filter((sourceCategory) => sourceCategory.enabled)
        .sort((left, right) => left.igrp - right.igrp),
    update: async ({ where }: Parameters<CrawlRunWriteClient["sourceCategory"]["update"]>[0]) => ({
      id: where.id,
    }),
  };

  crawlRun = {
    create: async ({ data }: Parameters<CrawlRunWriteClient["crawlRun"]["create"]>[0]) => {
      const crawlRun: FakeCrawlRun = {
        id: `crawl-run-${this.crawlRuns.length + 1}`,
        status: data.status,
        startedAt: data.startedAt,
        finishedAt: null,
      };
      this.crawlRuns.push(crawlRun);

      return { id: crawlRun.id };
    },
    update: async ({ where, data }: Parameters<CrawlRunWriteClient["crawlRun"]["update"]>[0]) => {
      const crawlRun = this.crawlRuns.find((candidate) => candidate.id === where.id);

      if (!crawlRun) {
        throw new Error(`Unknown crawl run: ${where.id}`);
      }

      crawlRun.status = data.status;
      crawlRun.finishedAt = data.finishedAt;

      return { id: crawlRun.id, status: crawlRun.status };
    },
  };

  crawlRunCategoryResult = {
    create: async ({
      data,
    }: Parameters<CrawlRunWriteClient["crawlRunCategoryResult"]["create"]>[0]) => {
      const result: FakeCategoryResult = {
        id: `category-result-${this.categoryResults.length + 1}`,
        crawlRunId: data.crawlRunId,
        sourceCategoryId: data.sourceCategoryId,
        status: data.status,
        rawSnapshotId: data.rawSnapshotId ?? null,
        errorMessage: data.errorMessage ?? null,
      };
      this.categoryResults.push(result);

      return { id: result.id };
    },
  };

  rawSnapshot = {
    // Raw snapshot storage deduplicates by content hash while still inserting
    // one metadata row per crawl result.
    findFirst: async ({ where }: Parameters<RawSnapshotWriteClient["rawSnapshot"]["findFirst"]>[0]) =>
      this.rawSnapshots.find(
        (snapshot) =>
          snapshot.contentHash === where.contentHash &&
          snapshot.compressedHtmlPath !== null &&
          snapshot.duplicateOfSnapshotId === null,
      ) ?? null,
    findMany: async ({
      where,
      take,
    }: Parameters<CoolpcCategorySnapshotWriteClient["rawSnapshot"]["findMany"]>[0]) =>
      this.rawSnapshots
        .filter(
          (snapshot) => {
            const successfulStatuses = new Set<CrawlRunCategoryResultStatusValue>(
              where.categoryResults.some.status.in,
            );
            const successfulResult = this.categoryResults.some(
              (result) =>
                result.rawSnapshotId === snapshot.id &&
                successfulStatuses.has(result.status),
            );

            return (
              snapshot.sourceCategoryId === where.sourceCategoryId &&
              snapshot.contentStatus === where.contentStatus &&
              snapshot.parsedResultHash !== null &&
              successfulResult
            );
          },
        )
        .sort((left, right) => right.fetchedAt.getTime() - left.fetchedAt.getTime())
        .slice(0, take)
        .map((snapshot) => ({ parsedResultHash: snapshot.parsedResultHash })),
    create: async ({ data }: Parameters<RawSnapshotWriteClient["rawSnapshot"]["create"]>[0]) => {
      const rawSnapshot: FakeRawSnapshot = {
        id: `raw-snapshot-${this.rawSnapshots.length + 1}`,
        crawlRunId: data.crawlRunId,
        sourceCategoryId: data.sourceCategoryId,
        url: data.url,
        fetchedAt: data.fetchedAt,
        httpStatus: data.httpStatus ?? null,
        fetchError: data.fetchError ?? null,
        contentStatus: data.contentStatus,
        contentHash: data.contentHash ?? null,
        parsedResultHash: data.parsedResultHash ?? null,
        compressedHtmlPath: data.compressedHtmlPath ?? null,
        duplicateOfSnapshotId: data.duplicateOfSnapshotId ?? null,
        createdAt: new Date("2026-05-27T11:00:00.000Z"),
      };
      this.rawSnapshots.push(rawSnapshot);

      return { id: rawSnapshot.id };
    },
  };

  recordSuccessfulCategoryResult({
    crawlRunId,
    sourceCategoryId,
    rawSnapshotId,
    status,
  }: {
    crawlRunId: string;
    sourceCategoryId: string;
    rawSnapshotId: string;
    status: CrawlRunCategoryResultStatusValue;
  }): void {
    this.categoryResults.push({
      id: `category-result-${this.categoryResults.length + 1}`,
      crawlRunId,
      sourceCategoryId,
      status,
      rawSnapshotId,
      errorMessage: null,
    });
  }
}

async function fixture(name: string): Promise<string> {
  return readFile(join(fixtureDir, name), "utf8");
}

function category({
  id,
  igrp,
  displayName = "CPU",
  sourceName = "處理器 CPU",
}: {
  id: string;
  igrp: number;
  displayName?: string;
  sourceName?: string;
}): CrawlRunSourceCategory {
  return {
    id,
    igrp,
    displayName,
    sourceName,
    enabled: true,
  };
}

function snapshot({
  rawHtml,
  fetchError = null,
  httpStatus = 200,
  fetchedAt = new Date("2026-05-27T11:00:00.000Z"),
}: {
  rawHtml: string | null;
  fetchError?: string | null;
  httpStatus?: number | null;
  fetchedAt?: Date;
}) {
  return {
    url: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
    fetchedAt,
    httpStatus,
    rawHtml,
    fetchError,
  };
}

function createProductWriterSpy(): {
  calls: Array<{
    crawlRunId: string;
    rawSnapshotId: string;
    sourceItemKeys: string[];
  }>;
  writeProducts: WriteCoolpcCategoryProducts;
} {
  const calls: Array<{
    crawlRunId: string;
    rawSnapshotId: string;
    sourceItemKeys: string[];
  }> = [];

  return {
    calls,
    writeProducts: async ({ crawlRunId, rawSnapshotId, items }) => {
      calls.push({
        crawlRunId,
        rawSnapshotId,
        sourceItemKeys: items.map((item) => item.sourceItemKey),
      });

      return {
        processedItemCount: items.length,
        createdProductCount: items.length,
        updatedProductCount: 0,
        priceSnapshotCreatedCount: items.length,
        priceUnchangedCount: 0,
      };
    },
  };
}

function fixedClock(): () => Date {
  return () => new Date("2026-05-27T11:00:00.000Z");
}

async function createTempDir(tempDirs: string[]): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "partsradar-category-snapshot-"));
  tempDirs.push(tempDir);
  return tempDir;
}
