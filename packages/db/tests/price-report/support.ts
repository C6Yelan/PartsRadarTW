// packages/db/tests/price-report/support.ts
// 提供 DB owner 的 price-report reader 測試所需最小 snapshot fixture 與 Prisma delegate fake。

import { vi } from "vitest";
import type { PriceReportReaderClient } from "../../src/price-report";

interface TestSnapshot {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  currency: string;
  capturedAt: Date;
  categoryIgrp: number;
  categoryName: string;
  categoryEnabled: boolean;
  vendorSlug: string | null;
  vendorName: string | null;
}

interface TestProductWhere {
  sourceCategory?: {
    enabled?: boolean;
    igrp?: { in?: number[] };
  };
  name?: { contains?: string };
  AND?: TestProductWhere[];
  OR?: TestProductWhere[];
}

export function snapshot({
  id,
  productId,
  productName,
  crawlRunId,
  price,
  capturedAt,
  currency = "TWD",
  categoryIgrp = 12,
  categoryName = "顯示卡",
  categoryEnabled = true,
  vendorSlug = "asus",
  vendorName = "華碩",
}: {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  capturedAt: string;
  currency?: string;
  categoryIgrp?: number;
  categoryName?: string;
  categoryEnabled?: boolean;
  vendorSlug?: string | null;
  vendorName?: string | null;
}): TestSnapshot {
  return {
    id,
    productId,
    productName,
    crawlRunId,
    price,
    currency,
    capturedAt: new Date(capturedAt),
    categoryIgrp,
    categoryName,
    categoryEnabled,
    vendorSlug,
    vendorName,
  };
}

export function createPriceReportReaderClient({ snapshots }: { snapshots: TestSnapshot[] }) {
  const priceSnapshotFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;
    const productFilter = where.product as TestProductWhere | undefined;

    if (typeof where.crawlRunId === "string") {
      return snapshots
        .filter(
          (item) =>
            item.crawlRunId === where.crawlRunId && matchesProductWhere(item, productFilter),
        )
        .sort(compareCapturedAtAsc)
        .map(toPrismaSnapshotWithProduct);
    }

    if (
      !where.productId &&
      typeof where.capturedAt === "object" &&
      where.capturedAt !== null &&
      "gte" in where.capturedAt &&
      "lte" in where.capturedAt
    ) {
      const capturedAt = where.capturedAt as { gte: Date; lte: Date };

      return snapshots
        .filter(
          (item) =>
            item.capturedAt.getTime() >= capturedAt.gte.getTime() &&
            item.capturedAt.getTime() <= capturedAt.lte.getTime() &&
            matchesProductWhere(item, productFilter),
        )
        .sort(compareCapturedAtAsc)
        .map(toPrismaSnapshotWithProduct);
    }

    const productId = where.productId as { in: string[] };
    const crawlRunId = where.crawlRunId as { not: string } | undefined;
    const capturedAt = where.capturedAt as { lt: Date };

    return snapshots
      .filter(
        (item) =>
          productId.in.includes(item.productId) &&
          (!crawlRunId || item.crawlRunId !== crawlRunId.not) &&
          item.capturedAt.getTime() < capturedAt.lt.getTime(),
      )
      .sort(comparePreviousSnapshotOrder)
      .map(({ id, productId: itemProductId, price, currency, capturedAt: itemCapturedAt }) => ({
        id,
        productId: itemProductId,
        price,
        currency,
        capturedAt: itemCapturedAt,
      }));
  });

  return {
    priceSnapshot: { findMany: priceSnapshotFindMany },
  } as unknown as PriceReportReaderClient;
}

function matchesProductWhere(snapshotItem: TestSnapshot, where: TestProductWhere | undefined) {
  if (!where) {
    return true;
  }
  if (where.sourceCategory?.enabled && !snapshotItem.categoryEnabled) {
    return false;
  }

  const categoryIgrps = where.sourceCategory?.igrp?.in ?? [];
  if (categoryIgrps.length > 0 && !categoryIgrps.includes(snapshotItem.categoryIgrp)) {
    return false;
  }

  const nameContains = where.name?.contains;
  if (
    nameContains &&
    !snapshotItem.productName.toLocaleLowerCase().includes(nameContains.toLocaleLowerCase())
  ) {
    return false;
  }
  if (!(where.AND ?? []).every((condition) => matchesProductWhere(snapshotItem, condition))) {
    return false;
  }
  return !where.OR || where.OR.some((condition) => matchesProductWhere(snapshotItem, condition));
}

function toPrismaSnapshotWithProduct(snapshotItem: TestSnapshot) {
  return {
    id: snapshotItem.id,
    productId: snapshotItem.productId,
    price: snapshotItem.price,
    currency: snapshotItem.currency,
    capturedAt: snapshotItem.capturedAt,
    product: {
      id: snapshotItem.productId,
      name: snapshotItem.productName,
      vendorSlug: snapshotItem.vendorSlug,
      vendorName: snapshotItem.vendorName,
      sourceCategory: {
        igrp: snapshotItem.categoryIgrp,
        displayName: snapshotItem.categoryName,
      },
    },
  };
}

function compareCapturedAtAsc(left: TestSnapshot, right: TestSnapshot) {
  return left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);
}

function comparePreviousSnapshotOrder(left: TestSnapshot, right: TestSnapshot) {
  return (
    left.productId.localeCompare(right.productId) ||
    right.capturedAt.getTime() - left.capturedAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}
