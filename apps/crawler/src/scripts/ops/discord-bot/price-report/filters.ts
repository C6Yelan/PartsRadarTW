// apps/crawler/src/scripts/ops/discord-bot/price-report/filters.ts
import type {
  PriceChangeDiscordNotificationItem,
  PriceReportNewProductItem,
} from "../../price-change-discord-notification";
import {
  MAX_PRICE_REPORT_KEYWORD_GROUPS,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
} from "../constants";

export interface PriceReportCategoryOption {
  igrp: number;
  displayName: string;
}

export interface PriceReportFilters {
  categoryIgrps: number[];
  productKeyword: string | null;
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
}

export interface PriceReportFilterSetting {
  categoryIgrps: number[];
  productKeyword: string | null;
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
}

export const DEFAULT_PRICE_REPORT_FILTERS: PriceReportFilters = {
  categoryIgrps: [],
  productKeyword: null,
  includePriceDrops: true,
  includePriceRises: true,
  includeNewProducts: true,
};

export function filterPriceChangesForReport(
  priceChanges: PriceChangeDiscordNotificationItem[],
  filters: PriceReportFilters,
): PriceChangeDiscordNotificationItem[] {
  const normalizedFilters = normalizePriceReportFilters(filters);
  const categoryIgrps = new Set(normalizedFilters.categoryIgrps);
  const keywordGroups = parseProductKeywordGroups(normalizedFilters.productKeyword);

  return priceChanges.filter((change) => {
    if (categoryIgrps.size > 0 && !categoryIgrps.has(change.category.igrp)) {
      return false;
    }

    if (change.delta < 0 && !normalizedFilters.includePriceDrops) {
      return false;
    }

    if (change.delta > 0 && !normalizedFilters.includePriceRises) {
      return false;
    }

    return matchesProductKeywordGroups(change.productName, keywordGroups);
  });
}

export function filterNewProductsForReport(
  newProducts: PriceReportNewProductItem[],
  filters: PriceReportFilters,
): PriceReportNewProductItem[] {
  const normalizedFilters = normalizePriceReportFilters(filters);
  const categoryIgrps = new Set(normalizedFilters.categoryIgrps);
  const keywordGroups = parseProductKeywordGroups(normalizedFilters.productKeyword);

  if (!normalizedFilters.includeNewProducts) {
    return [];
  }

  return newProducts.filter((product) => {
    if (categoryIgrps.size > 0 && !categoryIgrps.has(product.category.igrp)) {
      return false;
    }

    return matchesProductKeywordGroups(product.productName, keywordGroups);
  });
}

export function toPriceReportFilters(setting: PriceReportFilterSetting | null): PriceReportFilters {
  if (!setting) {
    return DEFAULT_PRICE_REPORT_FILTERS;
  }

  return normalizePriceReportFilters({
    categoryIgrps: setting.categoryIgrps,
    productKeyword: setting.productKeyword,
    includePriceDrops: setting.includePriceDrops,
    includePriceRises: setting.includePriceRises,
    includeNewProducts: setting.includeNewProducts,
  });
}

export function normalizePriceReportFilters(filters: PriceReportFilters): PriceReportFilters {
  const categoryIgrps = [...new Set(filters.categoryIgrps)]
    .filter((igrp) => Number.isSafeInteger(igrp) && igrp > 0)
    .sort((left, right) => left - right);
  const productKeyword = normalizePriceReportProductKeyword(filters.productKeyword);
  const includePriceDrops = filters.includePriceDrops;
  const includePriceRises = filters.includePriceRises;
  const includeNewProducts = filters.includeNewProducts;

  if (!includePriceDrops && !includePriceRises && !includeNewProducts) {
    return DEFAULT_PRICE_REPORT_FILTERS;
  }

  return {
    categoryIgrps,
    productKeyword,
    includePriceDrops,
    includePriceRises,
    includeNewProducts,
  };
}

export function formatPriceReportCategoryFilterLabel(
  filters: PriceReportFilters,
  categories: PriceReportCategoryOption[] = [],
): string {
  if (filters.categoryIgrps.length === 0) {
    return "全部分類";
  }

  const categoryNameByIgrp = new Map(
    categories.map((category) => [category.igrp, category.displayName]),
  );
  const labels = filters.categoryIgrps.map(
    (igrp) => categoryNameByIgrp.get(igrp) ?? `IGrp ${igrp}`,
  );
  const visibleLabels = labels.slice(0, 3);
  const hiddenCount = labels.length - visibleLabels.length;

  return hiddenCount > 0
    ? `${visibleLabels.join("、")} 等 ${labels.length} 個分類`
    : visibleLabels.join("、");
}

export function formatPriceReportKeywordFilterLabel(filters: PriceReportFilters): string {
  return filters.productKeyword ?? "不限";
}

export function formatPriceReportEventFilterLabel(filters: PriceReportFilters): string {
  const labels = [
    filters.includePriceDrops ? "降價" : null,
    filters.includePriceRises ? "漲價" : null,
    filters.includeNewProducts ? "新增商品" : null,
  ].filter((label): label is string => label !== null);

  return labels.join("、");
}

export function hasActivePriceReportFilters(filters: PriceReportFilters): boolean {
  return (
    filters.categoryIgrps.length > 0 ||
    filters.productKeyword !== null ||
    !filters.includePriceDrops ||
    !filters.includePriceRises ||
    !filters.includeNewProducts
  );
}

function normalizePriceReportProductKeyword(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const keyword = normalizePriceReportProductKeywordText(value);

  return keyword.length > 0 &&
    keyword.length <= MAX_PRICE_REPORT_KEYWORD_LENGTH &&
    parseProductKeywordGroups(keyword).length <= MAX_PRICE_REPORT_KEYWORD_GROUPS
    ? keyword
    : null;
}

function normalizePriceReportProductKeywordText(value: string): string {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((group) => group.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
}

function parseProductKeywordGroups(keyword: string | null): string[][] {
  if (!keyword) {
    return [];
  }

  return keyword
    .split(",")
    .map((group) => group.trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0);
}

function matchesProductKeywordGroups(productName: string, groups: string[][]): boolean {
  if (groups.length === 0) {
    return true;
  }

  const normalizedName = productName.toLocaleLowerCase("zh-Hant");

  return groups.some((tokens) =>
    tokens.every((token) => normalizedName.includes(token.toLocaleLowerCase("zh-Hant"))),
  );
}
