// packages/db/src/price-report/reader.ts
// 讀取 price snapshot 並整理成 Discord 與網站共用的價格變動與新增商品資料。

import { Prisma } from "@prisma/client";
import {
  assertPriceReportWorkBudget,
  PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
  PRICE_REPORT_PREDECESSOR_LOOKUP_BATCH_SIZE,
} from "./limits";
import {
  CURRENT_PRICE_SNAPSHOT_ORDER_BY,
  PREVIOUS_PRICE_SNAPSHOT_ORDER_BY,
  PREVIOUS_PRICE_SNAPSHOT_SELECT,
  PRICE_SNAPSHOT_WITH_PRODUCT_SELECT,
} from "./query";
import type {
  CrawlRunPriceChangeReadResult,
  CrawlRunPriceSnapshot,
  PreviousPriceSnapshot,
  PriceReportNewProductItem,
  PriceReportPriceChangeItem,
  PriceReportReaderClient,
  RecentPriceChangeOptions,
  RecentPriceReport,
} from "./types";
import {
  compareNewProducts,
  comparePriceChanges,
  createRecentPriceReportProductFilter,
  groupPreviousSnapshots,
  normalizeRecentPriceReportFilters,
  toProductSubcategory,
} from "./utils";

interface RawPriceReportQueryClient {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

interface PreviousSnapshotForCurrent extends PreviousPriceSnapshot {
  currentSnapshotId: string;
}

// 讀取指定 crawl run 的價格變動、新增商品與比對統計，供公開報告排程判斷與記錄。
export async function readCrawlRunPriceChangeSummary(
  client: PriceReportReaderClient,
  crawlRunId: string,
): Promise<CrawlRunPriceChangeReadResult> {
  const currentSnapshots = assertPriceReportWorkBudget(
    (await client.priceSnapshot.findMany({
      where: {
        crawlRunId,
        product: {
          isExcluded: false,
          sourceCategory: {
            enabled: true,
          },
        },
      },
      select: PRICE_SNAPSHOT_WITH_PRODUCT_SELECT,
      orderBy: CURRENT_PRICE_SNAPSHOT_ORDER_BY,
      take: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
    })) as unknown as CrawlRunPriceSnapshot[],
    "crawl_run_current",
    PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
  );

  if (currentSnapshots.length === 0) {
    return {
      changes: [],
      newProducts: [],
      snapshotCount: 0,
      unmatchedSnapshotCount: 0,
      unchangedSnapshotCount: 0,
      currencyMismatchCount: 0,
    };
  }

  const previousByCurrentSnapshot = new Map(
    (
      await readPreviousSnapshotsForCurrent(
        client,
        currentSnapshots.map(({ id, productId, capturedAt }) => ({
          id,
          productId,
          capturedAt,
        })),
        crawlRunId,
      )
    ).map((snapshot) => [snapshot.currentSnapshotId, snapshot]),
  );
  const changes: PriceReportPriceChangeItem[] = [];
  const newProductByProduct = new Map<string, PriceReportNewProductItem>();
  let unmatchedSnapshotCount = 0;
  let unchangedSnapshotCount = 0;
  let currencyMismatchCount = 0;

  for (const current of currentSnapshots) {
    const previous = previousByCurrentSnapshot.get(current.id);

    if (!previous) {
      unmatchedSnapshotCount += 1;
      const newProduct = newProductByProduct.get(current.productId);

      if (!newProduct) {
        newProductByProduct.set(current.productId, {
          productId: current.product.id,
          productName: current.product.name,
          category: current.product.sourceCategory,
          subcategory: toProductSubcategory(current.product),
          currentPrice: current.price,
          currency: current.currency,
          firstSeenAt: current.capturedAt,
        });
      } else {
        newProductByProduct.set(current.productId, {
          ...newProduct,
          productName: current.product.name,
          category: current.product.sourceCategory,
          subcategory: toProductSubcategory(current.product),
          currentPrice: current.price,
          currency: current.currency,
        });
      }
      continue;
    }

    if (previous.currency !== current.currency) {
      currencyMismatchCount += 1;
      continue;
    }

    if (previous.price === current.price) {
      unchangedSnapshotCount += 1;
      continue;
    }

    changes.push({
      productId: current.product.id,
      productName: current.product.name,
      category: current.product.sourceCategory,
      subcategory: toProductSubcategory(current.product),
      previousPrice: previous.price,
      currentPrice: current.price,
      currency: current.currency,
      changedAt: current.capturedAt,
      delta: current.price - previous.price,
    });
  }

  return {
    changes: changes.sort(comparePriceChanges),
    newProducts: [...newProductByProduct.values()].sort(compareNewProducts),
    snapshotCount: currentSnapshots.length,
    unmatchedSnapshotCount,
    unchangedSnapshotCount,
    currencyMismatchCount,
  };
}

// 讀取指定時間窗的完整價格報告，包含符合篩選的價格變動與新增商品。
export async function readRecentPriceReport(
  client: PriceReportReaderClient,
  { since, until = new Date(), filters = {} }: RecentPriceChangeOptions,
): Promise<RecentPriceReport> {
  if (since.getTime() >= until.getTime()) {
    return {
      priceChanges: [],
      newProducts: [],
    };
  }

  const normalizedFilters = normalizeRecentPriceReportFilters(filters);
  const productFilter = createRecentPriceReportProductFilter(normalizedFilters);

  if (
    !normalizedFilters.includePriceDrops &&
    !normalizedFilters.includePriceRises &&
    !normalizedFilters.includeNewProducts
  ) {
    return {
      priceChanges: [],
      newProducts: [],
    };
  }

  const currentSnapshots = assertPriceReportWorkBudget(
    (await client.priceSnapshot.findMany({
      where: {
        capturedAt: {
          gte: since,
          lte: until,
        },
        product: {
          isExcluded: false,
          ...productFilter,
        },
      },
      select: PRICE_SNAPSHOT_WITH_PRODUCT_SELECT,
      orderBy: CURRENT_PRICE_SNAPSHOT_ORDER_BY,
      take: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
    })) as unknown as CrawlRunPriceSnapshot[],
    "recent_current",
    PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
  );

  if (currentSnapshots.length === 0) {
    return {
      priceChanges: [],
      newProducts: [],
    };
  }

  const productIds = [...new Set(currentSnapshots.map((snapshot) => snapshot.productId))];
  const baselineSnapshots = await readLatestBaselines(client, productIds, since);
  const previousSnapshots = [
    ...baselineSnapshots,
    ...currentSnapshots.map(({ id, productId, price, currency, capturedAt }) => ({
      id,
      productId,
      price,
      currency,
      capturedAt,
    })),
  ].sort(comparePreviousSnapshots);
  const previousByProduct = groupPreviousSnapshots(previousSnapshots);
  const existingProductIds = new Set(
    baselineSnapshots
      .filter((snapshot) => snapshot.capturedAt.getTime() < since.getTime())
      .map((snapshot) => snapshot.productId),
  );
  const latestChangeByProduct = new Map<string, PriceReportPriceChangeItem>();
  const newProductByProduct = new Map<string, PriceReportNewProductItem>();

  for (const current of currentSnapshots) {
    if (!existingProductIds.has(current.productId)) {
      if (!normalizedFilters.includeNewProducts) {
        continue;
      }

      const newProduct = newProductByProduct.get(current.productId);

      if (!newProduct) {
        newProductByProduct.set(current.productId, {
          productId: current.product.id,
          productName: current.product.name,
          category: current.product.sourceCategory,
          subcategory: toProductSubcategory(current.product),
          currentPrice: current.price,
          currency: current.currency,
          firstSeenAt: current.capturedAt,
        });
      } else {
        newProductByProduct.set(current.productId, {
          ...newProduct,
          productName: current.product.name,
          category: current.product.sourceCategory,
          subcategory: toProductSubcategory(current.product),
          currentPrice: current.price,
          currency: current.currency,
        });
      }
      continue;
    }

    const previous = previousByProduct
      .get(current.productId)
      ?.find((snapshot) => snapshot.capturedAt.getTime() < current.capturedAt.getTime());

    if (!previous) {
      continue;
    }

    if (previous.price === current.price || previous.currency !== current.currency) {
      continue;
    }

    const delta = current.price - previous.price;

    latestChangeByProduct.set(current.productId, {
      productId: current.product.id,
      productName: current.product.name,
      category: current.product.sourceCategory,
      subcategory: toProductSubcategory(current.product),
      previousPrice: previous.price,
      currentPrice: current.price,
      currency: current.currency,
      changedAt: current.capturedAt,
      delta,
    });
  }

  return {
    priceChanges: [...latestChangeByProduct.values()]
      .filter((item) =>
        item.delta < 0 ? normalizedFilters.includePriceDrops : normalizedFilters.includePriceRises,
      )
      .sort(comparePriceChanges),
    newProducts: [...newProductByProduct.values()].sort(compareNewProducts),
  };
}

async function readLatestBaselines(
  client: PriceReportReaderClient,
  productIds: string[],
  before: Date,
): Promise<PreviousPriceSnapshot[]> {
  if (supportsRawQueries(client)) {
    return client.$queryRaw<PreviousPriceSnapshot[]>(
      Prisma.sql`
        WITH requested_products (product_id) AS (
          VALUES ${Prisma.join(productIds.map((productId) => Prisma.sql`(${productId}::uuid)`))}
        )
        SELECT
          previous.id::text AS id,
          previous.product_id::text AS "productId",
          previous.price,
          previous.currency::text AS currency,
          previous.captured_at AS "capturedAt"
        FROM requested_products AS requested
        JOIN LATERAL (
          SELECT snapshot.id, snapshot.product_id, snapshot.price, snapshot.currency, snapshot.captured_at
          FROM price_snapshots AS snapshot
          WHERE snapshot.product_id = requested.product_id
            AND snapshot.captured_at < ${before}
          ORDER BY snapshot.captured_at DESC, snapshot.id DESC
          LIMIT 1
        ) AS previous ON TRUE
        ORDER BY previous.product_id ASC
      `,
    );
  }

  const baselines = await readInFixedBatches(productIds, async (productId) => {
    const rows = (await client.priceSnapshot.findMany({
      where: {
        productId: { in: [productId] },
        capturedAt: { lt: before },
      },
      select: PREVIOUS_PRICE_SNAPSHOT_SELECT,
      orderBy: PREVIOUS_PRICE_SNAPSHOT_ORDER_BY,
      take: 1,
    })) as PreviousPriceSnapshot[];
    return rows[0] ?? null;
  });

  return baselines.filter((snapshot): snapshot is PreviousPriceSnapshot => snapshot !== null);
}

async function readPreviousSnapshotsForCurrent(
  client: PriceReportReaderClient,
  currentSnapshots: Array<Pick<PreviousPriceSnapshot, "id" | "productId" | "capturedAt">>,
  crawlRunId: string,
): Promise<PreviousSnapshotForCurrent[]> {
  if (supportsRawQueries(client)) {
    return client.$queryRaw<PreviousSnapshotForCurrent[]>(
      Prisma.sql`
        WITH requested_snapshots (current_snapshot_id, product_id, captured_at) AS (
          VALUES ${Prisma.join(
            currentSnapshots.map(
              (snapshot) =>
                Prisma.sql`(${snapshot.id}::uuid, ${snapshot.productId}::uuid, ${snapshot.capturedAt}::timestamptz)`,
            ),
          )}
        )
        SELECT
          requested.current_snapshot_id::text AS "currentSnapshotId",
          previous.id::text AS id,
          previous.product_id::text AS "productId",
          previous.price,
          previous.currency::text AS currency,
          previous.captured_at AS "capturedAt"
        FROM requested_snapshots AS requested
        JOIN LATERAL (
          SELECT snapshot.id, snapshot.product_id, snapshot.price, snapshot.currency, snapshot.captured_at
          FROM price_snapshots AS snapshot
          WHERE snapshot.product_id = requested.product_id
            AND snapshot.crawl_run_id <> ${crawlRunId}::uuid
            AND snapshot.captured_at < requested.captured_at
          ORDER BY snapshot.captured_at DESC, snapshot.id DESC
          LIMIT 1
        ) AS previous ON TRUE
        ORDER BY requested.current_snapshot_id ASC
      `,
    );
  }

  const previousSnapshots = await readInFixedBatches(currentSnapshots, async (current) => {
    const rows = (await client.priceSnapshot.findMany({
      where: {
        productId: { in: [current.productId] },
        crawlRunId: { not: crawlRunId },
        capturedAt: { lt: current.capturedAt },
      },
      select: PREVIOUS_PRICE_SNAPSHOT_SELECT,
      orderBy: PREVIOUS_PRICE_SNAPSHOT_ORDER_BY,
      take: 1,
    })) as PreviousPriceSnapshot[];
    const previous = rows[0];

    return previous ? { ...previous, currentSnapshotId: current.id } : null;
  });

  return previousSnapshots.filter(
    (snapshot): snapshot is PreviousSnapshotForCurrent => snapshot !== null,
  );
}

async function readInFixedBatches<TItem, TResult>(
  items: TItem[],
  readItem: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = [];

  for (
    let offset = 0;
    offset < items.length;
    offset += PRICE_REPORT_PREDECESSOR_LOOKUP_BATCH_SIZE
  ) {
    results.push(
      ...(await Promise.all(
        items.slice(offset, offset + PRICE_REPORT_PREDECESSOR_LOOKUP_BATCH_SIZE).map(readItem),
      )),
    );
  }

  return results;
}

function supportsRawQueries(
  client: PriceReportReaderClient,
): client is PriceReportReaderClient & RawPriceReportQueryClient {
  return "$queryRaw" in client && typeof client.$queryRaw === "function";
}

function comparePreviousSnapshots(
  left: PreviousPriceSnapshot,
  right: PreviousPriceSnapshot,
): number {
  const productDifference = left.productId.localeCompare(right.productId);

  if (productDifference !== 0) {
    return productDifference;
  }

  const timeDifference = right.capturedAt.getTime() - left.capturedAt.getTime();
  return timeDifference !== 0 ? timeDifference : right.id.localeCompare(left.id);
}
