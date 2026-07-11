// apps/crawler/tests/coolpc/support/data-flow-client.ts
// 提供 CoolPC crawler data-flow 測試用的整合 fake client 與資料查找 helper。

import type {
  CoolpcCategorySnapshotWriteClient,
  WriteCoolpcCategoryProductObservation,
} from "../../../src/coolpc/category-snapshot";
import { processCoolpcCategorySnapshot } from "../../../src/coolpc/category-snapshot";
import {
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunSourceCategory,
  type CrawlRunWriteClient,
  runCoolpcCrawlOnce,
} from "../../../src/coolpc/crawl-run";
import type { CoolpcProductWriteClient } from "../../../src/coolpc/product-write";
import type { RawSnapshotWriteClient } from "../../../src/coolpc/raw-snapshot-writer";
import type {
  FakeCategoryResult,
  FakeCrawlRun,
  FakeParseError,
  FakeRawSnapshot,
  FakeSourceCategory,
} from "./data-flow-records";
import { FakeCoolpcProductWriteClient, type FakeProduct } from "./product-write-client";

// 串接 crawl run、category snapshot 與 product write 的記憶體 fake client，供 data-flow 測試驗證跨模組資料變化。
export class FakeCoolpcDataFlowClient
  extends FakeCoolpcProductWriteClient
  implements CrawlRunWriteClient, CoolpcCategorySnapshotWriteClient, CoolpcProductWriteClient
{
  readonly sourceCategories: FakeSourceCategory[];
  readonly crawlRuns: FakeCrawlRun[] = [];
  readonly categoryResults: FakeCategoryResult[] = [];
  readonly rawSnapshots: FakeRawSnapshot[] = [];
  readonly parseErrors: FakeParseError[] = [];

  constructor(categories: CrawlRunSourceCategory[]) {
    super();
    this.sourceCategories = categories.map((sourceCategory) => ({
      ...sourceCategory,
      lastCheckedAt: null,
      lastSuccessAt: null,
    }));
  }

  sourceCategory = {
    findMany: async () =>
      [...this.sourceCategories]
        .filter((sourceCategory) => sourceCategory.enabled)
        .sort((left, right) => left.igrp - right.igrp),
    update: async ({
      where,
      data,
    }: Parameters<CrawlRunWriteClient["sourceCategory"]["update"]>[0]) => {
      const sourceCategory = this.sourceCategories.find((candidate) => candidate.id === where.id);

      if (!sourceCategory) {
        throw new Error(`Unknown source category: ${where.id}`);
      }

      sourceCategory.lastCheckedAt = data.lastCheckedAt;
      if ("lastSuccessAt" in data) {
        sourceCategory.lastSuccessAt = data.lastSuccessAt ?? null;
      }

      return { id: where.id };
    },
  };

  crawlRun = {
    create: async ({ data }: Parameters<CrawlRunWriteClient["crawlRun"]["create"]>[0]) => {
      const crawlRun: FakeCrawlRun = {
        id: `crawl-run-${this.crawlRuns.length + 1}`,
        status: data.status,
        startedAt: data.startedAt,
        finishedAt: null,
        triggerType: data.triggerType,
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
    // data-flow 測試只需要 content hash 去重與最近成功 snapshot 查詢，不模擬完整 Prisma 行為。
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
        createdAt: data.fetchedAt,
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
}

// 以單一 raw HTML 執行一輪 category snapshot + crawl run，模擬 scheduled crawler 的核心寫入路徑。
export async function runSnapshot({
  client,
  storageDir,
  rawHtml,
  fetchedAt,
  writeProducts,
}: {
  client: FakeCoolpcDataFlowClient;
  storageDir: string;
  rawHtml: string;
  fetchedAt: Date;
  writeProducts?: WriteCoolpcCategoryProductObservation;
}) {
  return runCoolpcCrawlOnce({
    client,
    now: () => fetchedAt,
    processCategory: ({ crawlRunId, category: sourceCategory }) =>
      processCoolpcCategorySnapshot({
        client,
        storageDir,
        crawlRunId,
        category: sourceCategory,
        snapshot: {
          fetchedAt,
          httpStatus: 200,
          rawHtml,
        },
        writeProducts,
      }),
  });
}

// 建立 data-flow 測試使用的 CPU source category。
export function category(): CrawlRunSourceCategory {
  return {
    id: "category-4",
    igrp: 4,
    sourceName: "處理器 CPU",
    displayName: "CPU",
    enabled: true,
  };
}

// 從 CPU fixture 移除第二個商品，用來模擬商品連續缺漏。
export function keepOnlyFirstProduct(rawHtml: string): string {
  const secondProduct = `      <div class="item">
        <div class="w">CPU-TOKEN-002</div>
        <span>
          <img alt="" src="/eval/4/intel14600k.jpg">
          <div class="t">Intel Core i5-14600K【14核/20緒】</div>
          <div class="x">含稅：NT9,990</div>
        </span>
      </div>
`;

  if (!rawHtml.includes(secondProduct)) {
    throw new Error("Fixture no longer contains the expected second product block.");
  }

  return rawHtml.replace(secondProduct, "");
}

// 依 ibuy token 從 fake client 找商品，找不到時讓測試直接失敗。
export function productByToken(client: FakeCoolpcDataFlowClient, ibuyToken: string): FakeProduct {
  const product = client.products.find((candidate) => candidate.ibuyToken === ibuyToken);

  if (!product) {
    throw new Error(`Missing product: ${ibuyToken}`);
  }

  return product;
}
