// apps/web/app/api/products/[id]/price-history/response.ts
import type { PriceHistoryProductRecord, PriceHistorySnapshotRecord } from "./data";
import type { PriceHistoryRange } from "./query";

type PriceHistoryObservationType = "price_snapshot" | "current_price_confirmation";

interface PriceHistoryPointResponse {
  amount: number;
  currency: "TWD";
  observedAt: string;
  observationType: PriceHistoryObservationType;
  source: PriceHistoryObservationType;
}

interface PriceHistorySummaryPoint {
  amount: number;
  observedAt: string;
}

export interface ProductPriceHistoryResponseBody {
  productId: string;
  range: "7d" | "30d" | "90d" | "all";
  rangeDays: 7 | 30 | 90 | null;
  points: PriceHistoryPointResponse[];
  summary: {
    pointCount: number;
    startedAt: string | null;
    endedAt: string | null;
    lowest: PriceHistorySummaryPoint | null;
    highest: PriceHistorySummaryPoint | null;
    first: PriceHistorySummaryPoint | null;
    latest: PriceHistorySummaryPoint | null;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
}

export function toPriceHistoryResponse(
  productId: string,
  range: PriceHistoryRange,
  snapshots: PriceHistorySnapshotRecord[],
  product: PriceHistoryProductRecord,
  since: Date | null,
): ProductPriceHistoryResponseBody {
  const points = toPriceHistoryPoints(snapshots, product.currentPrice, since);

  const first = points[0] ? toSummaryPoint(points[0]) : null;
  const latest = points.at(-1) ? toSummaryPoint(points.at(-1) as PriceHistoryPointResponse) : null;
  const lowest = points.length > 0 ? toSummaryPoint(minByAmount(points)) : null;
  const highest = points.length > 0 ? toSummaryPoint(maxByAmount(points)) : null;
  const deltaAmount = first && latest && points.length >= 2 ? latest.amount - first.amount : null;

  return {
    productId,
    range: range.key,
    rangeDays: range.days,
    points,
    summary: {
      pointCount: points.length,
      startedAt: first?.observedAt ?? null,
      endedAt: latest?.observedAt ?? null,
      lowest,
      highest,
      first,
      latest,
      deltaAmount,
      deltaPercent:
        deltaAmount !== null && first && first.amount !== 0
          ? Number(((deltaAmount / first.amount) * 100).toFixed(2))
          : null,
    },
  };
}

function toPriceHistoryPoints(
  snapshots: PriceHistorySnapshotRecord[],
  currentPrice: PriceHistoryProductRecord["currentPrice"],
  since: Date | null,
): PriceHistoryPointResponse[] {
  const points: PriceHistoryPointResponse[] = snapshots.map((snapshot) => ({
    amount: snapshot.price,
    currency: snapshot.currency,
    observedAt: snapshot.capturedAt.toISOString(),
    observationType: "price_snapshot",
    source: "price_snapshot",
  }));

  if (!currentPrice || (since && currentPrice.lastSeenAt.getTime() < since.getTime())) {
    return points;
  }

  const latestPoint = points.at(-1);

  if (
    latestPoint &&
    currentPrice.lastSeenAt.getTime() <= new Date(latestPoint.observedAt).getTime()
  ) {
    return points;
  }

  points.push({
    amount: currentPrice.priceSnapshot.price,
    currency: currentPrice.priceSnapshot.currency,
    observedAt: currentPrice.lastSeenAt.toISOString(),
    observationType: "current_price_confirmation",
    source: "current_price_confirmation",
  });

  return points;
}

function toSummaryPoint(point: PriceHistoryPointResponse): PriceHistorySummaryPoint {
  return {
    amount: point.amount,
    observedAt: point.observedAt,
  };
}

function minByAmount(points: PriceHistoryPointResponse[]): PriceHistoryPointResponse {
  return points.reduce((lowest, point) => (point.amount < lowest.amount ? point : lowest));
}

function maxByAmount(points: PriceHistoryPointResponse[]): PriceHistoryPointResponse {
  return points.reduce((highest, point) => (point.amount > highest.amount ? point : highest));
}
