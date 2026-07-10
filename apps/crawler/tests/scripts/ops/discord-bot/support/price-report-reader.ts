// apps/crawler/tests/scripts/ops/discord-bot/support/price-report-reader.ts
// 提供價格報告 reader 測試共用 snapshot fixture 與 focused fake client 入口。

import { vi } from "vitest";
import type { PriceReportReaderClient } from "../../../../../src/scripts/ops/discord-bot/price-report/reader-types";
import {
  compareCapturedAtAsc,
  comparePreviousSnapshotOrder,
  matchesProductWhere,
  toPrismaSnapshotWithProduct,
} from "./client-mappers";
import { snapshot, type TestProductWhere, type TestSnapshot } from "./data";

export { snapshot };

type PriceChangeTestClient = PriceReportReaderClient & {
  priceSnapshot: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

// 建立支援 crawl-run 與近期時間窗查詢形狀的 fake reader client。
export function createPriceChangeClient(snapshots: TestSnapshot[]): PriceChangeTestClient {
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
  } as unknown as PriceChangeTestClient;
}
