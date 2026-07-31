// apps/web/app/api/products/[id]/price-history/response.ts
// 組裝商品價格歷史 API 回應，包含觀測點與目前價格確認點。

import type { PriceHistoryProductRecord, PriceHistorySnapshotRecord } from "./data";
import { PRICE_HISTORY_BUCKET_COUNT, PRICE_HISTORY_MAX_RESPONSE_POINTS } from "./limits";
import type { PriceHistoryRange } from "./query";

type PriceHistoryObservationType = "price_snapshot" | "current_price_confirmation";

interface PriceHistoryPointResponse {
  amount: number;
  observedAt: string;
  observationType: PriceHistoryObservationType;
}

export interface ProductPriceHistoryResponseBody {
  range: "7d" | "30d" | "90d" | "all";
  rangeDays: 7 | 30 | 90 | null;
  points: PriceHistoryPointResponse[];
  sampling?: {
    downsampled: true;
    strategy: "time_bucket_first_last";
    bucketCount: number;
    pointLimit: number;
  };
}

// 將 DB snapshot 與目前價格確認資料轉成 public response，維持 API 的 UTC ISO 時間格式。
export function toPriceHistoryResponse(
  range: PriceHistoryRange,
  snapshots: PriceHistorySnapshotRecord[],
  product: PriceHistoryProductRecord,
  since: Date | null,
  downsampled = false,
): ProductPriceHistoryResponseBody {
  const points = toPriceHistoryPoints(snapshots, product.currentPrice, since);

  return {
    range: range.key,
    rangeDays: range.days,
    points,
    ...(downsampled
      ? {
          sampling: {
            downsampled: true as const,
            strategy: "time_bucket_first_last" as const,
            bucketCount: PRICE_HISTORY_BUCKET_COUNT,
            pointLimit: PRICE_HISTORY_MAX_RESPONSE_POINTS,
          },
        }
      : {}),
  };
}

// 建立價格觀測點；若目前價格在最後一筆 snapshot 後仍被看到，補一筆 confirmation 點供圖表延伸。
function toPriceHistoryPoints(
  snapshots: PriceHistorySnapshotRecord[],
  currentPrice: PriceHistoryProductRecord["currentPrice"],
  since: Date | null,
): PriceHistoryPointResponse[] {
  const points: PriceHistoryPointResponse[] = snapshots.map((snapshot) => ({
    amount: snapshot.price,
    observedAt: snapshot.capturedAt.toISOString(),
    observationType: "price_snapshot",
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
    observedAt: currentPrice.lastSeenAt.toISOString(),
    observationType: "current_price_confirmation",
  });

  return points;
}
