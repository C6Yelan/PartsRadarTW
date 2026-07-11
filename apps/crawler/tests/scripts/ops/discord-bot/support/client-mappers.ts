// apps/crawler/tests/scripts/ops/discord-bot/support/client-mappers.ts
// 將 Discord bot 測試資料轉成 fake Prisma client 需要的回傳形狀。
import type { TestProductWhere, TestSnapshot, TestTargetPriceWatch } from "./data-types";

// 將測試 snapshot 包成 price report reader 會讀到的 product 關聯 payload。
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

// 將測試 snapshot 轉成 watch 列表需要的商品與目前價格 payload。
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

// 將 watch 測試資料接上最新 snapshot，模擬 watch manager 查詢到的商品關聯。
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

// 模擬 price report reader 目前用到的 product where 子集合，避免 fake client 實作完整 Prisma。
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

// 依 capturedAt 與 id 穩定排序 snapshot，對齊 reader 查詢的時間遞增順序。
export function compareCapturedAtAsc(left: TestSnapshot, right: TestSnapshot): number {
  return left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);
}

// 依商品與時間挑選前一筆 snapshot，模擬 reader 查詢 previous snapshot 的排序。
export function comparePreviousSnapshotOrder(left: TestSnapshot, right: TestSnapshot): number {
  return (
    left.productId.localeCompare(right.productId) ||
    right.capturedAt.getTime() - left.capturedAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}
