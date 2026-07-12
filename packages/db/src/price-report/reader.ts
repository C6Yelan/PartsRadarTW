// packages/db/src/price-report/reader.ts
// 讀取 price snapshot 並整理成 Discord 與網站共用的價格變動與新增商品資料。

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

// 讀取指定 crawl run 的價格變動、新增商品與比對統計，供公開報告排程判斷與記錄。
export async function readCrawlRunPriceChangeSummary(
  client: PriceReportReaderClient,
  crawlRunId: string,
): Promise<CrawlRunPriceChangeReadResult> {
  const currentSnapshots = (await client.priceSnapshot.findMany({
    where: { crawlRunId },
    select: PRICE_SNAPSHOT_WITH_PRODUCT_SELECT,
    orderBy: CURRENT_PRICE_SNAPSHOT_ORDER_BY,
  })) as unknown as CrawlRunPriceSnapshot[];

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

  const productIds = [...new Set(currentSnapshots.map((snapshot) => snapshot.productId))];
  const latestCapturedAt = new Date(
    Math.max(...currentSnapshots.map((snapshot) => snapshot.capturedAt.getTime())),
  );
  const previousSnapshots = (await client.priceSnapshot.findMany({
    where: {
      productId: { in: productIds },
      crawlRunId: { not: crawlRunId },
      capturedAt: { lt: latestCapturedAt },
    },
    select: PREVIOUS_PRICE_SNAPSHOT_SELECT,
    orderBy: PREVIOUS_PRICE_SNAPSHOT_ORDER_BY,
  })) as PreviousPriceSnapshot[];
  const previousByProduct = groupPreviousSnapshots(previousSnapshots);
  const changes: PriceReportPriceChangeItem[] = [];
  const newProductByProduct = new Map<string, PriceReportNewProductItem>();
  let unmatchedSnapshotCount = 0;
  let unchangedSnapshotCount = 0;
  let currencyMismatchCount = 0;

  for (const current of currentSnapshots) {
    const previous = previousByProduct
      .get(current.productId)
      ?.find((snapshot) => snapshot.capturedAt.getTime() < current.capturedAt.getTime());

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

  const currentSnapshots = (await client.priceSnapshot.findMany({
    where: {
      capturedAt: {
        gte: since,
        lte: until,
      },
      ...(Object.keys(productFilter).length > 0
        ? {
            product: productFilter,
          }
        : {}),
    },
    select: PRICE_SNAPSHOT_WITH_PRODUCT_SELECT,
    orderBy: CURRENT_PRICE_SNAPSHOT_ORDER_BY,
  })) as unknown as CrawlRunPriceSnapshot[];

  if (currentSnapshots.length === 0) {
    return {
      priceChanges: [],
      newProducts: [],
    };
  }

  const productIds = [...new Set(currentSnapshots.map((snapshot) => snapshot.productId))];
  const baselineSnapshots = (await client.priceSnapshot.findMany({
    where: {
      productId: { in: productIds },
      capturedAt: { lt: since },
    },
    select: PREVIOUS_PRICE_SNAPSHOT_SELECT,
    orderBy: PREVIOUS_PRICE_SNAPSHOT_ORDER_BY,
    distinct: ["productId"],
  })) as PreviousPriceSnapshot[];
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
        item.delta < 0
          ? normalizedFilters.includePriceDrops
          : normalizedFilters.includePriceRises,
      )
      .sort(comparePriceChanges),
    newProducts: [...newProductByProduct.values()].sort(compareNewProducts),
  };
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
