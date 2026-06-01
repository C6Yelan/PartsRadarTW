import type {
  CoolpcCategorySnapshotWriteClient,
  WriteCoolpcCategoryProducts,
} from "../../../src/coolpc/category-snapshot";
import { processCoolpcCategorySnapshot } from "../../../src/coolpc/category-snapshot";
import {
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunSourceCategory,
  type CrawlRunStatusValue,
  type CrawlRunWriteClient,
  runCoolpcCrawlOnce,
} from "../../../src/coolpc/crawl-run";
import type { CoolpcProductWriteClient } from "../../../src/coolpc/product-write";
import type {
  RawSnapshotContentStatusValue,
  RawSnapshotWriteClient,
} from "../../../src/coolpc/raw-snapshot-writer";
import {
  type FakeCurrentPrice,
  FakeCoolpcProductWriteClient,
  type FakeProduct,
} from "./product-write-client";

interface FakeSourceCategory extends CrawlRunSourceCategory {
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
}

interface FakeCrawlRun {
  id: string;
  status: CrawlRunStatusValue;
  startedAt: Date;
  finishedAt: Date | null;
  triggerType: string;
}

interface FakeCategoryResult {
  id: string;
  crawlRunId: string;
  sourceCategoryId: string;
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string | null;
  errorMessage: string | null;
}

interface FakeSourceCategoryUpdate {
  sourceCategoryId: string;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  updatedLastSuccessAt: boolean;
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

interface FakeParseError {
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

export class FakeCoolpcDataFlowClient
  extends FakeCoolpcProductWriteClient
  implements CrawlRunWriteClient, CoolpcCategorySnapshotWriteClient, CoolpcProductWriteClient
{
  readonly sourceCategories: FakeSourceCategory[];
  readonly crawlRuns: FakeCrawlRun[] = [];
  readonly categoryResults: FakeCategoryResult[] = [];
  readonly sourceCategoryUpdates: FakeSourceCategoryUpdate[] = [];
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

      this.sourceCategoryUpdates.push({
        sourceCategoryId: where.id,
        lastCheckedAt: data.lastCheckedAt,
        lastSuccessAt: data.lastSuccessAt,
        updatedLastSuccessAt: "lastSuccessAt" in data,
      });

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
    // The data-flow tests need hash dedupe and latest-success lookup, but no
    // broader Prisma behavior.
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
  writeProducts?: WriteCoolpcCategoryProducts;
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

export function category(): CrawlRunSourceCategory {
  return {
    id: "category-4",
    igrp: 4,
    sourceName: "處理器 CPU",
    displayName: "CPU",
    enabled: true,
  };
}

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

export function productByToken(client: FakeCoolpcDataFlowClient, ibuyToken: string): FakeProduct {
  const product = client.products.find((candidate) => candidate.ibuyToken === ibuyToken);

  if (!product) {
    throw new Error(`Missing product: ${ibuyToken}`);
  }

  return product;
}

export function currentPriceByToken(
  client: FakeCoolpcDataFlowClient,
  ibuyToken: string,
): FakeCurrentPrice {
  const product = productByToken(client, ibuyToken);
  const currentPrice = client.currentPrices.find((candidate) => candidate.productId === product.id);

  if (!currentPrice) {
    throw new Error(`Missing current price: ${ibuyToken}`);
  }

  return currentPrice;
}

export function last<T>(items: T[]): T {
  const item = items[items.length - 1];

  if (!item) {
    throw new Error("Expected at least one item.");
  }

  return item;
}
