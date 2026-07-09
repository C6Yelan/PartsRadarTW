// apps/web/app/api/products/[id]/price-history/query.ts
// 解析商品價格歷史 API 的 range/days query，限制公開可查詢的時間範圍。

import { InvalidQueryError, parseOptionalIntegerQuery } from "../../../_shared/query";

const ALLOWED_RANGE_DAYS = new Set([7, 30, 90]);
const ALLOWED_RANGE_VALUES = new Set(["7d", "30d", "90d", "all"]);

export const PRICE_HISTORY_MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PriceHistoryRange {
  key: "7d" | "30d" | "90d" | "all";
  days: 7 | 30 | 90 | null;
}

// 將 query 轉成價格歷史查詢範圍；`range=all` 不套日期下限，其餘只允許 7/30/90 天。
export function parsePriceHistoryRange(params: URLSearchParams): PriceHistoryRange {
  const range = params.get("range");

  if (range) {
    if (!ALLOWED_RANGE_VALUES.has(range)) {
      throw new InvalidQueryError("range", "must be one of 7d, 30d, 90d, or all");
    }

    return range === "all"
      ? { key: "all", days: null }
      : {
          key: range as "7d" | "30d" | "90d",
          days: Number.parseInt(range, 10) as 7 | 30 | 90,
        };
  }

  const days =
    parseOptionalIntegerQuery(params, "days", {
      defaultValue: 90,
      min: 1,
      max: 90,
    }) ?? 90;

  if (!ALLOWED_RANGE_DAYS.has(days)) {
    throw new InvalidQueryError("days", "must be one of 7, 30, or 90");
  }

  return {
    key: `${days}d` as "7d" | "30d" | "90d",
    days: days as 7 | 30 | 90,
  };
}
