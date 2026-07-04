// apps/crawler/tests/scripts/ops/discord-bot/price-report-reader-support.ts
import { vi } from "vitest";
import type { PriceReportReaderClient } from "../../../../src/scripts/ops/discord-bot/price-report/reader-types";

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
  vendorSlug: string | null;
  vendorName: string | null;
}

interface TestProductWhere {
  sourceCategory?: {
    igrp?: {
      in?: number[];
    };
  };
  name?: {
    contains?: string;
  };
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
    vendorSlug,
    vendorName,
  };
}

export function createPriceChangeClient(snapshots: TestSnapshot[]): PriceReportReaderClient & {
  priceSnapshot: {
    findMany: ReturnType<typeof vi.fn>;
  };
} {
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;

    if (typeof where.crawlRunId === "string") {
      return snapshots
        .filter((snapshot) => snapshot.crawlRunId === where.crawlRunId)
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
      const capturedAtFilter = where.capturedAt as { gte: Date; lte: Date };
      const productFilter = where.product as TestProductWhere | undefined;

      return snapshots
        .filter(
          (snapshot) =>
            snapshot.capturedAt.getTime() >= capturedAtFilter.gte.getTime() &&
            snapshot.capturedAt.getTime() <= capturedAtFilter.lte.getTime() &&
            matchesProductWhere(snapshot, productFilter),
        )
        .sort(compareCapturedAtAsc)
        .map(toPrismaSnapshotWithProduct);
    }

    const productIdFilter = where.productId as { in: string[] };
    const crawlRunFilter = where.crawlRunId as { not: string } | undefined;
    const capturedAtFilter = where.capturedAt as { lt: Date };

    return snapshots
      .filter(
        (snapshot) =>
          productIdFilter.in.includes(snapshot.productId) &&
          (!crawlRunFilter || snapshot.crawlRunId !== crawlRunFilter.not) &&
          snapshot.capturedAt.getTime() < capturedAtFilter.lt.getTime(),
      )
      .sort(comparePreviousSnapshotOrder)
      .map((snapshot) => ({
        id: snapshot.id,
        productId: snapshot.productId,
        price: snapshot.price,
        currency: snapshot.currency,
        capturedAt: snapshot.capturedAt,
      }));
  });

  return {
    priceSnapshot: {
      findMany,
    },
  } as unknown as PriceReportReaderClient & {
    priceSnapshot: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
}

function toPrismaSnapshotWithProduct(snapshot: TestSnapshot) {
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

function matchesProductWhere(snapshot: TestSnapshot, where: TestProductWhere | undefined): boolean {
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

function compareCapturedAtAsc(left: TestSnapshot, right: TestSnapshot): number {
  return left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);
}

function comparePreviousSnapshotOrder(left: TestSnapshot, right: TestSnapshot): number {
  return (
    left.productId.localeCompare(right.productId) ||
    right.capturedAt.getTime() - left.capturedAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}
