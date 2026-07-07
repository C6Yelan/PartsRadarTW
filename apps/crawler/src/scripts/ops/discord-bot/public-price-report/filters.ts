// apps/crawler/src/scripts/ops/discord-bot/public-price-report/filters.ts
// 定義公開價格報告的預設篩選條件，並轉接共用 price-report 篩選正規化邏輯。

import { MAX_PRICE_REPORT_ITEMS } from "../constants";
import {
  normalizePriceReportFilters,
  type PriceReportFilters,
} from "../price-report/filters";

export type { PriceReportFilters };

type PublicPriceReportFilterSetting = Pick<
  PriceReportFilters,
  | "categoryIgrps"
  | "productKeyword"
  | "includePriceDrops"
  | "includePriceRises"
  | "includeNewProducts"
>;

// 公開報告預設只顯示價格變動，避免伺服器頻道被新增商品洗版。
export const DEFAULT_PUBLIC_PRICE_REPORT_FILTERS: PriceReportFilters = {
  categoryIgrps: [],
  productKeyword: null,
  includePriceDrops: true,
  includePriceRises: true,
  includeNewProducts: false,
};

// 將公開報告 DB 設定轉成 price-report 共用篩選模型，缺設定時回到公開報告預設值。
export function toPublicPriceReportFilters(
  setting: PublicPriceReportFilterSetting | null,
): PriceReportFilters {
  if (!setting) {
    return DEFAULT_PUBLIC_PRICE_REPORT_FILTERS;
  }

  return normalizePublicPriceReportFilters({
    categoryIgrps: setting.categoryIgrps,
    productKeyword: setting.productKeyword,
    includePriceDrops: setting.includePriceDrops,
    includePriceRises: setting.includePriceRises,
    includeNewProducts: setting.includeNewProducts,
  });
}

// 限制公開報告最多列出的商品數，避免 Discord 頻道報告過長。
export function clampPublicPriceReportMaxItems(value: number): number {
  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}

// 正規化公開報告篩選；若內容類型全關閉，回到公開報告預設值避免產生空設定。
export function normalizePublicPriceReportFilters(filters: PriceReportFilters): PriceReportFilters {
  if (!filters.includePriceDrops && !filters.includePriceRises && !filters.includeNewProducts) {
    return DEFAULT_PUBLIC_PRICE_REPORT_FILTERS;
  }

  return normalizePriceReportFilters(filters);
}
