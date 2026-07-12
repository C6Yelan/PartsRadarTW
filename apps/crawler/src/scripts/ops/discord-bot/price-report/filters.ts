// apps/crawler/src/scripts/ops/discord-bot/price-report/filters.ts
// 定義 price-report 篩選條件，並提供分類、內容類型與商品關鍵字的正規化、套用與顯示文字。

import { MAX_PRICE_REPORT_KEYWORD_GROUPS, MAX_PRICE_REPORT_KEYWORD_LENGTH } from "../constants";
import type {
  PriceReportNewProductItem,
  PriceReportPriceChangeItem,
} from "@partsradar/db/price-report";

// Discord 設定面板使用的來源分類選項，對應 CoolPC sourceCategory 的 IGrp 與顯示名稱。
export interface PriceReportCategoryOption {
  igrp: number;
  displayName: string;
}

// 個人與公開價格報告共用的篩選條件，涵蓋分類、商品關鍵字與內容類型。
export interface PriceReportFilters {
  categoryIgrps: number[];
  productKeyword: string | null;
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
}

// 可轉換成 PriceReportFilters 的 persisted setting contract。
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
  includeNewProducts: false,
};

// 依篩選條件過濾價格變動項目，保留符合分類、價格方向與商品關鍵字的項目。
export function filterPriceChangesForReport(
  priceChanges: PriceReportPriceChangeItem[],
  filters: PriceReportFilters,
): PriceReportPriceChangeItem[] {
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

// 依篩選條件過濾新增商品項目；若使用者停用新增商品，直接回傳空清單。
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

// 將 persisted setting 轉成 report 讀取與訊息組裝可直接使用的正規化 filters。
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

// 收斂 filters 的分類、關鍵字與內容類型；若所有內容類型都關閉，回到預設避免產生空報告設定。
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

// 將分類篩選轉成設定面板摘要文字，未知 IGrp 保留原始編號方便維護判讀。
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

// 將商品關鍵字篩選轉成設定面板摘要文字。
export function formatPriceReportKeywordFilterLabel(filters: PriceReportFilters): string {
  return filters.productKeyword ?? "不限";
}

// 將報告內容類型篩選轉成設定面板摘要文字。
export function formatPriceReportContentFilterLabel(filters: PriceReportFilters): string {
  const labels = [
    filters.includePriceDrops ? "降價" : null,
    filters.includePriceRises ? "漲價" : null,
    filters.includeNewProducts ? "新增商品" : null,
  ].filter((label): label is string => label !== null);

  return labels.join("、");
}

// 判斷目前 filters 是否和預設篩選不同，供訊息文案標示已套用自訂篩選。
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
