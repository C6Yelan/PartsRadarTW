// apps/crawler/tests/scripts/ops/discord-bot/support-client-mappers.ts
import type { TestProductWhere, TestSnapshot, TestTargetPriceWatch } from "./support-data";

export function toPrismaSnapshotWithProduct(snapshot: TestSnapshot) {
  return {
    id: snapshot.id,
    productId: snapshot.productId,
    price: snapshot.price,
    currency: snapshot.currency,
    capturedAt: snapshot.capturedAt,
    product: {
      id: snapshot.productId,
      name: snapshot.productName,
      vendorSlug: snapshot.vendorSlug,
      vendorName: snapshot.vendorName,
      sourceCategory: {
        igrp: snapshot.categoryIgrp,
        displayName: snapshot.categoryName,
      },
    },
  };
}

export function toPrismaWatchProduct(snapshot: TestSnapshot) {
  return {
    id: snapshot.productId,
    name: snapshot.productName,
    currentPrice: {
      lastSeenAt: snapshot.capturedAt,
      priceSnapshot: {
        price: snapshot.price,
        currency: snapshot.currency,
        capturedAt: snapshot.capturedAt,
      },
    },
  };
}

export function toPrismaWatchListRecord(watch: TestTargetPriceWatch, snapshots: TestSnapshot[]) {
  const latestSnapshot = snapshots
    .filter((snapshot) => snapshot.productId === watch.productId)
    .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0];

  return {
    id: watch.id,
    discordUserId: watch.discordUserId,
    productId: watch.productId,
    targetPrice: watch.targetPrice,
    currency: watch.currency,
    enabled: watch.enabled,
    lastNotifiedAt: watch.lastNotifiedAt,
    notificationCursorAt: watch.notificationCursorAt,
    updatedAt: watch.updatedAt,
    product: latestSnapshot
      ? toPrismaWatchProduct(latestSnapshot)
      : {
          id: watch.productId,
          name: "Unknown product",
          currentPrice: null,
        },
  };
}

export function matchesProductWhere(
  snapshot: TestSnapshot,
  where: TestProductWhere | undefined,
): boolean {
  if (!where) {
    return true;
  }

  const categoryIgrps = where.sourceCategory?.igrp?.in ?? [];

  if (categoryIgrps.length > 0 && !categoryIgrps.includes(snapshot.categoryIgrp)) {
    return false;
  }

  const nameContains = where.name?.contains;

  if (
    nameContains &&
    !snapshot.productName.toLocaleLowerCase().includes(nameContains.toLocaleLowerCase())
  ) {
    return false;
  }

  if (!(where.AND ?? []).every((condition) => matchesProductWhere(snapshot, condition))) {
    return false;
  }

  return !where.OR || where.OR.some((condition) => matchesProductWhere(snapshot, condition));
}

export function compareCapturedAtAsc(left: TestSnapshot, right: TestSnapshot): number {
  return left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);
}

export function comparePreviousSnapshotOrder(left: TestSnapshot, right: TestSnapshot): number {
  return (
    left.productId.localeCompare(right.productId) ||
    right.capturedAt.getTime() - left.capturedAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}
