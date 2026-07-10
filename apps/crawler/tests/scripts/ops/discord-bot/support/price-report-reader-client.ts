// apps/crawler/tests/scripts/ops/discord-bot/support/price-report-reader-client.ts
// 模擬個人價格報告 reader 需要的 product、priceSnapshot 與 sourceCategory delegate。
import { vi } from "vitest";
import {
  compareCapturedAtAsc,
  comparePreviousSnapshotOrder,
  matchesProductWhere,
  toPrismaSnapshotWithProduct,
  toPrismaWatchProduct,
} from "./client-mappers";
import type { TestProductWhere, TestSnapshot, TestSourceCategory } from "./data";

// 依測試 snapshots 建立可查 crawl run、時間窗與前一筆價格的 in-memory reader client。
export function createPriceReportReaderClient({
  snapshots,
  categories,
}: {
  snapshots: TestSnapshot[];
  categories: TestSourceCategory[];
}) {
  const productFindFirst = vi.fn(async (args: { where: { id?: string } }) => {
    const productId = args.where.id;
    const latestSnapshot = snapshots
      .filter((snapshot) => snapshot.productId === productId)
      .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0];

    return latestSnapshot ? toPrismaWatchProduct(latestSnapshot) : null;
  });
  const sourceCategories = [
    ...categories,
    ...snapshots.map((item) => ({ igrp: item.categoryIgrp, displayName: item.categoryName })),
  ].filter(
    (category, index, allCategories) =>
      allCategories.findIndex((item) => item.igrp === category.igrp) === index,
  );
  const sourceCategoryFindMany = vi.fn(
    async (_args: {
      where: { enabled: boolean };
      select: { igrp: boolean; displayName: boolean };
      orderBy: Array<Record<string, string>>;
    }) => sourceCategories.sort((left, right) => left.igrp - right.igrp),
  );
  const priceSnapshotFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;
    const productFilter = where.product as TestProductWhere | undefined;

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
    const capturedAtFilter = where.capturedAt as { lt: Date };

    return snapshots
      .filter(
        (snapshot) =>
          productIdFilter.in.includes(snapshot.productId) &&
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
    product: {
      findFirst: productFindFirst,
    },
    priceSnapshot: {
      findMany: priceSnapshotFindMany,
    },
    sourceCategory: {
      findMany: sourceCategoryFindMany,
    },
  };
}
