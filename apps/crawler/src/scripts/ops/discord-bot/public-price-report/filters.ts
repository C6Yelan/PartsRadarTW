// apps/crawler/src/scripts/ops/discord-bot/public-price-report/filters.ts

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

export const DEFAULT_PUBLIC_PRICE_REPORT_FILTERS: PriceReportFilters = {
  categoryIgrps: [],
  productKeyword: null,
  includePriceDrops: true,
  includePriceRises: true,
  includeNewProducts: false,
};

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

export function clampPublicPriceReportMaxItems(value: number): number {
  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}

export function normalizePublicPriceReportFilters(filters: PriceReportFilters): PriceReportFilters {
  if (!filters.includePriceDrops && !filters.includePriceRises && !filters.includeNewProducts) {
    return DEFAULT_PUBLIC_PRICE_REPORT_FILTERS;
  }

  return normalizePriceReportFilters(filters);
}
