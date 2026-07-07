// apps/crawler/src/scripts/ops/discord-bot/price-report/limits.ts
// 收斂個人價格報告輸出端共用的數量上限，避免設定或指令輸入繞過最大筆數限制。

import { MAX_PRICE_REPORT_ITEMS } from "../constants";

// 將價格報告要求筆數限制在 Discord 報告可接受的輸出範圍內。
export function clampPriceReportMaxItems(value: number): number {
  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}
