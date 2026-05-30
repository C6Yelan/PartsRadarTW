import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type CoolpcCategorySnapshotWriteClient,
  processCoolpcCategorySnapshot,
} from "./category-snapshot";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  runCoolpcCrawlOnce,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunSourceCategory,
  type CrawlRunStatusValue,
  type CrawlRunWriteClient,
} from "./crawl-run";
import type { ParsedCoolpcProduct } from "./parser";
import type { CoolpcProductWriteClient } from "./product-write";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  type RawSnapshotContentStatusValue,
  type RawSnapshotWriteClient,
} from "./raw-snapshot";

const fixtureDir = join(__dirname, "__fixtures__");

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

interface FakeProduct {
  id: string;
  sourceCategoryId: string;
  ibuyToken: string;
  name: string;
  normalizedName: string;
  vendorSlug: string | null;
  vendorName: string | null;
  primaryImageUrl: string;
  primaryImageCheckedAt: Date;
  sourceUrl: string;
  isActive: boolean;
  missingSince: Date | null;
  missingSeenCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface FakePriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: ParsedCoolpcProduct["currency"];
  capturedAt: Date;
  crawlRunId: string;
  rawSnapshotId: string | null;
}

interface FakeCurrentPrice {
  productId: string;
  priceSnapshotId: string;
  lastSeenAt: Date;
  priceChangedAt: Date;
}

class FakeCoolpcDataFlowClient
  implements CrawlRunWriteClient, CoolpcCategorySnapshotWriteClient, CoolpcProductWriteClient
{
  readonly sourceCategories: FakeSourceCategory[];
  readonly crawlRuns: FakeCrawlRun[] = [];
  readonly categoryResults: FakeCategoryResult[] = [];
  readonly sourceCategoryUpdates: FakeSourceCategoryUpdate[] = [];
  readonly rawSnapshots: FakeRawSnapshot[] = [];
  readonly parseErrors: FakeParseError[] = [];
  readonly products: FakeProduct[] = [];
  readonly priceSnapshots: FakePriceSnapshot[] = [];
  readonly currentPrices: FakeCurrentPrice[] = [];

  constructor(categories: CrawlRunSourceCategory[]) {
    this.sourceCategories = categories.map((sourceCategory) => ({
      ...sourceCategory,
      lastCheckedAt: null,
      lastSuccessAt: null,
    }));
  }

  async $transaction<T>(operation: (client: CoolpcProductWriteClient) => Promise<T>): Promise<T> {
    return operation(this);
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
    // The data-flow tests need both hash dedupe and latest-success lookup, but
    // no broader Prisma behavior. Keep this fake scoped to those two queries.
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

  product = {
    findUnique: async ({
      where,
    }: Parameters<CoolpcProductWriteClient["product"]["findUnique"]>[0]) => {
      const identity = where.sourceCategoryId_ibuyToken;
      const product =
        this.products.find(
          (candidate) =>
            candidate.sourceCategoryId === identity.sourceCategoryId &&
            candidate.ibuyToken === identity.ibuyToken,
        ) ?? null;

      if (!product) {
        return null;
      }

      const currentPrice =
        this.currentPrices.find((candidate) => candidate.productId === product.id) ?? null;
      const priceSnapshot = currentPrice
        ? (this.priceSnapshots.find((candidate) => candidate.id === currentPrice.priceSnapshotId) ??
          null)
        : null;

      return {
        id: product.id,
        currentPrice:
          currentPrice && priceSnapshot
            ? {
                ...currentPrice,
                priceSnapshot,
              }
            : null,
      };
    },
    findMany: async ({ where }: Parameters<CoolpcProductWriteClient["product"]["findMany"]>[0]) =>
      this.products
        .filter((product) => product.sourceCategoryId === where.sourceCategoryId)
        .map((product) => ({
          id: product.id,
          ibuyToken: product.ibuyToken,
          isActive: product.isActive,
          missingSince: product.missingSince,
          missingSeenCount: product.missingSeenCount,
        })),
    create: async ({ data }: Parameters<CoolpcProductWriteClient["product"]["create"]>[0]) => {
      const product: FakeProduct = {
        id: `product-${this.products.length + 1}`,
        sourceCategoryId: data.sourceCategoryId,
        ibuyToken: data.ibuyToken,
        name: data.name,
        normalizedName: data.normalizedName,
        vendorSlug: data.vendorSlug,
        vendorName: data.vendorName,
        primaryImageUrl: data.primaryImageUrl,
        primaryImageCheckedAt: data.primaryImageCheckedAt,
        sourceUrl: data.sourceUrl,
        isActive: data.isActive,
        missingSince: data.missingSince,
        missingSeenCount: data.missingSeenCount,
        firstSeenAt: data.firstSeenAt,
        lastSeenAt: data.lastSeenAt,
      };
      this.products.push(product);

      return { id: product.id };
    },
    update: async ({
      where,
      data,
    }: Parameters<CoolpcProductWriteClient["product"]["update"]>[0]) => {
      const product = this.products.find((candidate) => candidate.id === where.id);

      if (!product) {
        throw new Error(`Unknown product: ${where.id}`);
      }

      Object.assign(product, data);
      return { id: product.id };
    },
  };

  priceSnapshot = {
    create: async ({
      data,
    }: Parameters<CoolpcProductWriteClient["priceSnapshot"]["create"]>[0]) => {
      const priceSnapshot: FakePriceSnapshot = {
        id: `price-snapshot-${this.priceSnapshots.length + 1}`,
        productId: data.productId,
        price: data.price,
        currency: data.currency,
        capturedAt: data.capturedAt,
        crawlRunId: data.crawlRunId,
        rawSnapshotId: data.rawSnapshotId,
      };
      this.priceSnapshots.push(priceSnapshot);

      return { id: priceSnapshot.id };
    },
  };

  currentPrice = {
    create: async ({ data }: Parameters<CoolpcProductWriteClient["currentPrice"]["create"]>[0]) => {
      const currentPrice: FakeCurrentPrice = {
        productId: data.productId,
        priceSnapshotId: data.priceSnapshotId,
        lastSeenAt: data.lastSeenAt,
        priceChangedAt: data.priceChangedAt,
      };
      this.currentPrices.push(currentPrice);

      return { productId: currentPrice.productId };
    },
    update: async ({
      where,
      data,
    }: Parameters<CoolpcProductWriteClient["currentPrice"]["update"]>[0]) => {
      const currentPrice = this.currentPrices.find(
        (candidate) => candidate.productId === where.productId,
      );

      if (!currentPrice) {
        throw new Error(`Unknown current price: ${where.productId}`);
      }

      Object.assign(currentPrice, data);
      return { productId: currentPrice.productId };
    },
  };
}

async function runSnapshot({
  client,
  storageDir,
  rawHtml,
  fetchedAt,
}: {
  client: FakeCoolpcDataFlowClient;
  storageDir: string;
  rawHtml: string;
  fetchedAt: Date;
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
      }),
  });
}

async function fixture(name: string): Promise<string> {
  return readFile(join(fixtureDir, name), "utf8");
}

function category(): CrawlRunSourceCategory {
  return {
    id: "category-4",
    igrp: 4,
    sourceName: "處理器 CPU",
    displayName: "CPU",
    enabled: true,
  };
}

function keepOnlyFirstProduct(rawHtml: string): string {
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

function productByToken(client: FakeCoolpcDataFlowClient, ibuyToken: string): FakeProduct {
  const product = client.products.find((candidate) => candidate.ibuyToken === ibuyToken);

  if (!product) {
    throw new Error(`Missing product: ${ibuyToken}`);
  }

  return product;
}

function currentPriceByToken(
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

function last<T>(items: T[]): T {
  const item = items[items.length - 1];

  if (!item) {
    throw new Error("Expected at least one item.");
  }

  return item;
}

async function createTempDir(tempDirs: string[]): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "partsradar-data-flow-"));
  tempDirs.push(tempDir);
  return tempDir;
}
