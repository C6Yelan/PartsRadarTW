// apps/crawler/src/scripts/ops/price-change-discord-notification/reader.ts

import type { Prisma } from "@partsradar/db";
import type {
  CrawlRunPriceChangeReadResult,
  CrawlRunPriceSnapshot,
  PreviousPriceSnapshot,
  PriceChangeDiscordClient,
  PriceChangeDiscordNotificationItem,
  PriceReportNewProductItem,
  RecentPriceChangeOptions,
  RecentPriceReport,
  RecentPriceReportFilters,
} from "./types";

export async function readCrawlRunPriceChanges(
  client: PriceChangeDiscordClient,
  crawlRunId: string,
): Promise<PriceChangeDiscordNotificationItem[]> {
  return (await readCrawlRunPriceChangeSummary(client, crawlRunId)).changes;
}

export async function readCrawlRunPriceChangeSummary(
  client: PriceChangeDiscordClient,
  crawlRunId: string,
): Promise<CrawlRunPriceChangeReadResult> {
  const currentSnapshots = (await client.priceSnapshot.findMany({
    where: { crawlRunId },
    select: {
      id: true,
      productId: true,
      price: true,
      currency: true,
      capturedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          vendorSlug: true,
          vendorName: true,
          sourceCategory: {
            select: {
              igrp: true,
              displayName: true,
            },
          },
        },
      },
    },
    orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
  })) as CrawlRunPriceSnapshot[];

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
    select: {
      id: true,
      productId: true,
      price: true,
      currency: true,
      capturedAt: true,
    },
    orderBy: [{ productId: "asc" }, { capturedAt: "desc" }, { id: "desc" }],
  })) as PreviousPriceSnapshot[];
  const previousByProduct = groupPreviousSnapshots(previousSnapshots);
  const changes: PriceChangeDiscordNotificationItem[] = [];
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

export async function readRecentPriceChanges(
  client: PriceChangeDiscordClient,
  { since, until = new Date() }: RecentPriceChangeOptions,
): Promise<PriceChangeDiscordNotificationItem[]> {
  return (await readRecentPriceReport(client, { since, until })).priceChanges;
}

export async function readRecentPriceReport(
  client: PriceChangeDiscordClient,
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
    select: {
      id: true,
      productId: true,
      price: true,
      currency: true,
      capturedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          vendorSlug: true,
          vendorName: true,
          sourceCategory: {
            select: {
              igrp: true,
              displayName: true,
            },
          },
        },
      },
    },
    orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
  })) as CrawlRunPriceSnapshot[];

  if (currentSnapshots.length === 0) {
    return {
      priceChanges: [],
      newProducts: [],
    };
  }

  const productIds = [...new Set(currentSnapshots.map((snapshot) => snapshot.productId))];
  const previousSnapshots = (await client.priceSnapshot.findMany({
    where: {
      productId: { in: productIds },
      capturedAt: { lt: until },
    },
    select: {
      id: true,
      productId: true,
      price: true,
      currency: true,
      capturedAt: true,
    },
    orderBy: [{ productId: "asc" }, { capturedAt: "desc" }, { id: "desc" }],
  })) as PreviousPriceSnapshot[];
  const previousByProduct = groupPreviousSnapshots(previousSnapshots);
  const existingProductIds = new Set(
    previousSnapshots
      .filter((snapshot) => snapshot.capturedAt.getTime() < since.getTime())
      .map((snapshot) => snapshot.productId),
  );
  const latestChangeByProduct = new Map<string, PriceChangeDiscordNotificationItem>();
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

    if (
      (delta < 0 && !normalizedFilters.includePriceDrops) ||
      (delta > 0 && !normalizedFilters.includePriceRises)
    ) {
      continue;
    }

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
    priceChanges: [...latestChangeByProduct.values()].sort(comparePriceChanges),
    newProducts: [...newProductByProduct.values()].sort(compareNewProducts),
  };
}

function normalizeRecentPriceReportFilters(
  filters: RecentPriceReportFilters,
): Required<RecentPriceReportFilters> {
  return {
    categoryIgrps: [...new Set(filters.categoryIgrps ?? [])]
      .filter((igrp) => Number.isSafeInteger(igrp) && igrp > 0)
      .sort((left, right) => left - right),
    productKeyword: normalizeProductKeyword(filters.productKeyword),
    includePriceDrops: filters.includePriceDrops ?? true,
    includePriceRises: filters.includePriceRises ?? true,
    includeNewProducts: filters.includeNewProducts ?? true,
  };
}

function createRecentPriceReportProductFilter(
  filters: Required<RecentPriceReportFilters>,
): Prisma.ProductWhereInput {
  const keywordFilter = filters.productKeyword
    ? createProductKeywordFilter(filters.productKeyword)
    : {};

  return {
    ...(filters.categoryIgrps.length > 0
      ? {
          sourceCategory: {
            igrp: {
              in: filters.categoryIgrps,
            },
          },
        }
      : {}),
    ...keywordFilter,
  };
}

function normalizeProductKeyword(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const keyword = normalizeProductKeywordText(value);

  return keyword.length > 0 ? keyword : null;
}

function createProductKeywordFilter(keyword: string): Prisma.ProductWhereInput {
  const groups = parseProductKeywordGroups(keyword);

  if (groups.length === 0) {
    return {};
  }

  if (groups.length === 1) {
    return createProductKeywordGroupFilter(groups[0] ?? []);
  }

  return {
    OR: groups.map((tokens) => createProductKeywordGroupFilter(tokens)),
  };
}

function createProductKeywordGroupFilter(tokens: string[]): Prisma.ProductWhereInput {
  if (tokens.length <= 1) {
    return {
      name: {
        contains: tokens[0] ?? "",
        mode: "insensitive",
      },
    };
  }

  return {
    AND: tokens.map((token) => ({
      name: {
        contains: token,
        mode: "insensitive",
      },
    })),
  };
}

function parseProductKeywordGroups(keyword: string): string[][] {
  return keyword
    .split(",")
    .map((group) => group.trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0);
}

function normalizeProductKeywordText(value: string): string {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((group) => group.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
}

function toProductSubcategory(product: CrawlRunPriceSnapshot["product"]) {
  return product.vendorName
    ? {
        slug: product.vendorSlug,
        displayName: product.vendorName,
      }
    : null;
}

function groupPreviousSnapshots(
  snapshots: PreviousPriceSnapshot[],
): Map<string, PreviousPriceSnapshot[]> {
  const groups = new Map<string, PreviousPriceSnapshot[]>();

  for (const snapshot of snapshots) {
    const group = groups.get(snapshot.productId) ?? [];
    group.push(snapshot);
    groups.set(snapshot.productId, group);
  }

  return groups;
}

function comparePriceChanges(
  left: PriceChangeDiscordNotificationItem,
  right: PriceChangeDiscordNotificationItem,
): number {
  const deltaDiff = Math.abs(right.delta) - Math.abs(left.delta);

  if (deltaDiff !== 0) {
    return deltaDiff;
  }

  const timeDiff = right.changedAt.getTime() - left.changedAt.getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.productName.localeCompare(right.productName, "zh-Hant");
}

function compareNewProducts(
  left: PriceReportNewProductItem,
  right: PriceReportNewProductItem,
): number {
  const timeDiff = right.firstSeenAt.getTime() - left.firstSeenAt.getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.productName.localeCompare(right.productName, "zh-Hant");
}
