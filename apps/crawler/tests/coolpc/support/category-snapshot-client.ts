// apps/crawler/tests/coolpc/support/category-snapshot-client.ts
// 提供 category snapshot 與 crawl run 測試用的記憶體 fake client 與共用 fixture factory。

import type {
  CoolpcCategorySnapshotWriteClient,
  WriteCoolpcCategoryProductObservation,
} from "../../../src/coolpc/category-snapshot";
import type {
  CrawlRunCategoryResultStatusValue,
  CrawlRunSourceCategory,
  CrawlRunWriteClient,
} from "../../../src/coolpc/crawl-run";
import type { RawSnapshotWriteClient } from "../../../src/coolpc/raw-snapshot-writer";
import type {
  FakeCategoryResult,
  FakeCrawlRun,
  FakeParseError,
  FakeRawSnapshot,
} from "./category-snapshot-records";

// 只實作這組測試會碰到的 Prisma delegate 方法，讓測試聚焦 crawler write contract 而不需要測試資料庫。
export class FakeCrawlerWriteClient
  implements CrawlRunWriteClient, CoolpcCategorySnapshotWriteClient
{
  readonly crawlRuns: FakeCrawlRun[] = [];
  readonly categoryResults: FakeCategoryResult[] = [];
  readonly rawSnapshots: FakeRawSnapshot[] = [];
  readonly parseErrors: FakeParseError[] = [];

  constructor(private readonly categories: CrawlRunSourceCategory[]) {}

  sourceCategory = {
    // 模擬 production 查詢語意：只回傳 enabled category，並依來源分類順序排列。
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
    updateMany: async ({
      where,
      data,
    }: Parameters<CrawlRunWriteClient["crawlRun"]["updateMany"]>[0]) => {
      const crawlRun = this.crawlRuns.find(
        (candidate) =>
          candidate.id === where.id &&
          candidate.status === where.status &&
          candidate.finishedAt === where.finishedAt,
      );

      if (!crawlRun) {
        return { count: 0 };
      }

      crawlRun.status = data.status;
      crawlRun.finishedAt = data.finishedAt;
      return { count: 1 };
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
    // raw snapshot storage 會用 content hash 去重，但每個 crawl result 仍會新增一筆 metadata。
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

// 建立測試用 source category，預設為 CPU 分類。
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

// 建立測試用 category snapshot input，預設模擬成功抓到 CPU 分類頁。
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

// 建立 product writer spy，讓測試能檢查寫入流程收到哪些 parsed product。
export function createProductWriterSpy(): {
  calls: Array<{
    crawlRunId: string;
    rawSnapshotId: string;
    sourceCategoryId: string;
    fetchedAt: Date;
    sourceItemKeys: string[];
    filterTags: string[][];
  }>;
  writeProducts: WriteCoolpcCategoryProductObservation;
} {
  const calls: Array<{
    crawlRunId: string;
    rawSnapshotId: string;
    sourceCategoryId: string;
    fetchedAt: Date;
    sourceItemKeys: string[];
    filterTags: string[][];
  }> = [];

  return {
    calls,
    writeProducts: async ({
      crawlRunId,
      rawSnapshotId,
      sourceCategoryId,
      fetchedAt,
      parsedProducts,
    }) => {
      calls.push({
        crawlRunId,
        rawSnapshotId,
        sourceCategoryId,
        fetchedAt,
        sourceItemKeys: parsedProducts.map((item) => item.sourceItemKey),
        filterTags: parsedProducts.map((item) => item.filterTags),
      });

      return {
        processedItemCount: parsedProducts.length,
        createdProductCount: parsedProducts.length,
        createdProductIds: parsedProducts.map((_, index) => `product-${index + 1}`),
        updatedProductCount: 0,
        priceSnapshotCreatedCount: parsedProducts.length,
        priceUnchangedCount: 0,
        missingProductUpdatedCount: 0,
        markedInactiveProductCount: 0,
      };
    },
  };
}

// 固定測試時間，避免 snapshot / crawl run 狀態斷言受目前時間影響。
export function fixedClock(): () => Date {
  return () => new Date("2026-05-27T11:00:00.000Z");
}
