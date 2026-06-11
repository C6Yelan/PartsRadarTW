// apps/crawler/src/scripts/ops/price-change-discord-notification/reader.ts

import type {
  CrawlRunPriceChangeReadResult,
  CrawlRunPriceSnapshot,
  PreviousPriceSnapshot,
  PriceChangeDiscordClient,
  PriceChangeDiscordNotificationItem,
  PriceReportNewProductItem,
  RecentPriceChangeOptions,
  RecentPriceReport,
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
        },
      },
    },
    orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
  })) as CrawlRunPriceSnapshot[];

  if (currentSnapshots.length === 0) {
    return {
      changes: [],
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
  let unmatchedSnapshotCount = 0;
  let unchangedSnapshotCount = 0;
  let currencyMismatchCount = 0;

  for (const current of currentSnapshots) {
    const previous = previousByProduct
      .get(current.productId)
      ?.find((snapshot) => snapshot.capturedAt.getTime() < current.capturedAt.getTime());

    if (!previous) {
      unmatchedSnapshotCount += 1;
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
      previousPrice: previous.price,
      currentPrice: current.price,
      currency: current.currency,
      changedAt: current.capturedAt,
      delta: current.price - previous.price,
    });
  }

  return {
    changes: changes.sort(comparePriceChanges),
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
  { since, until = new Date() }: RecentPriceChangeOptions,
): Promise<RecentPriceReport> {
  if (since.getTime() >= until.getTime()) {
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
      const newProduct = newProductByProduct.get(current.productId);

      if (!newProduct) {
        newProductByProduct.set(current.productId, {
          productId: current.product.id,
          productName: current.product.name,
          currentPrice: current.price,
          currency: current.currency,
          firstSeenAt: current.capturedAt,
        });
      } else {
        newProductByProduct.set(current.productId, {
          ...newProduct,
          productName: current.product.name,
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

    latestChangeByProduct.set(current.productId, {
      productId: current.product.id,
      productName: current.product.name,
      previousPrice: previous.price,
      currentPrice: current.price,
      currency: current.currency,
      changedAt: current.capturedAt,
      delta: current.price - previous.price,
    });
  }

  return {
    priceChanges: [...latestChangeByProduct.values()].sort(comparePriceChanges),
    newProducts: [...newProductByProduct.values()].sort(compareNewProducts),
  };
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
