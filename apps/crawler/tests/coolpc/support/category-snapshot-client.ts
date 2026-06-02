// apps/crawler/tests/coolpc/support/category-snapshot-client.ts
import type {
  CoolpcCategorySnapshotWriteClient,
  WriteCoolpcCategoryProducts,
} from "../../../src/coolpc/category-snapshot";
import type {
  CrawlRunCategoryResultStatusValue,
  CrawlRunSourceCategory,
  CrawlRunStatusValue,
  CrawlRunWriteClient,
} from "../../../src/coolpc/crawl-run";
import type {
  RawSnapshotContentStatusValue,
  RawSnapshotWriteClient,
} from "../../../src/coolpc/raw-snapshot-writer";

export interface FakeCrawlRun {
  id: string;
  status: CrawlRunStatusValue;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface FakeCategoryResult {
  id: string;
  crawlRunId: string;
  sourceCategoryId: string;
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string | null;
  errorMessage: string | null;
}

export interface FakeRawSnapshot {
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

export interface FakeParseError {
  id: string;
  crawlRunId: string;
  rawSnapshotId: string | null;
  sourceCategoryId: string;
  errorType: string;
  message: string;
  rawName: string | null;
  rawPriceText: string | null;
  rawToken: string | null;
  rawImageUrl: string | null;
}

// The fake implements only the Prisma delegate methods touched by this slice.
// That keeps the tests focused on the crawler write contract without requiring
// a test database.
export class FakeCrawlerWriteClient
  implements CrawlRunWriteClient, CoolpcCategorySnapshotWriteClient
{
  readonly crawlRuns: FakeCrawlRun[] = [];
  readonly categoryResults: FakeCategoryResult[] = [];
  readonly rawSnapshots: FakeRawSnapshot[] = [];
  readonly parseErrors: FakeParseError[] = [];

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
    findFirst: async ({
      where,
    }: Parameters<RawSnapshotWriteClient["rawSnapshot"]["findFirst"]>[0]) =>
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
        .filter((snapshot) => {
          const successfulStatuses = new Set<CrawlRunCategoryResultStatusValue>(
            where.categoryResults.some.status.in,
          );
          const successfulResult = this.categoryResults.some(
            (result) =>
              result.rawSnapshotId === snapshot.id && successfulStatuses.has(result.status),
          );

          return (
            snapshot.sourceCategoryId === where.sourceCategoryId &&
            snapshot.contentStatus === where.contentStatus &&
            snapshot.parsedResultHash !== null &&
            successfulResult
          );
        })
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

  parseError = {
    createMany: async ({
      data,
    }: Parameters<CoolpcCategorySnapshotWriteClient["parseError"]["createMany"]>[0]) => {
      const parseErrors = data.map((item, index) => ({
        id: `parse-error-${this.parseErrors.length + index + 1}`,
        crawlRunId: item.crawlRunId,
        rawSnapshotId: item.rawSnapshotId,
        sourceCategoryId: item.sourceCategoryId,
        errorType: item.errorType,
        message: item.message,
        rawName: item.rawName,
        rawPriceText: item.rawPriceText,
        rawToken: item.rawToken,
        rawImageUrl: item.rawImageUrl,
      }));
      this.parseErrors.push(...parseErrors);

      return { count: parseErrors.length };
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

export function category({
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

export function snapshot({
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

export function createProductWriterSpy(): {
  calls: Array<{
    crawlRunId: string;
    rawSnapshotId: string;
    sourceCategoryId: string;
    fetchedAt: Date;
    sourceItemKeys: string[];
  }>;
  writeProducts: WriteCoolpcCategoryProducts;
} {
  const calls: Array<{
    crawlRunId: string;
    rawSnapshotId: string;
    sourceCategoryId: string;
    fetchedAt: Date;
    sourceItemKeys: string[];
  }> = [];

  return {
    calls,
    writeProducts: async ({ crawlRunId, rawSnapshotId, sourceCategoryId, fetchedAt, items }) => {
      calls.push({
        crawlRunId,
        rawSnapshotId,
        sourceCategoryId,
        fetchedAt,
        sourceItemKeys: items.map((item) => item.sourceItemKey),
      });

      return {
        processedItemCount: items.length,
        createdProductCount: items.length,
        updatedProductCount: 0,
        priceSnapshotCreatedCount: items.length,
        priceUnchangedCount: 0,
        missingProductUpdatedCount: 0,
        markedInactiveProductCount: 0,
      };
    },
  };
}

export function fixedClock(): () => Date {
  return () => new Date("2026-05-27T11:00:00.000Z");
}
