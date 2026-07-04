// apps/crawler/src/scripts/ops/discord-bot/price-report/limits.ts
import { MAX_PRICE_REPORT_ITEMS } from "../constants";

export function clampPriceReportMaxItems(value: number): number {
  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}
