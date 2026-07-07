// apps/crawler/src/scripts/ops/discord-bot/price-report/reader-utils.ts
// 提供價格報告 reader 共用的篩選正規化、Prisma 查詢條件、分組與排序規則。

import type { Prisma } from "@partsradar/db";
import type {
  CrawlRunPriceSnapshot,
  PreviousPriceSnapshot,
  PriceReportPriceChangeItem,
  PriceReportNewProductItem,
  RecentPriceReportFilters,
} from "./reader-types";

// 正規化報告篩選條件，讓 reader 後續查詢與內容類型判斷使用完整預設值。
export function normalizeRecentPriceReportFilters(
  filters: RecentPriceReportFilters,
): Required<RecentPriceReportFilters> {
  return {
    categoryIgrps: [...new Set(filters.categoryIgrps ?? [])]
      .filter((igrp) => Number.isSafeInteger(igrp) && igrp > 0)
      .sort((left, right) => left - right),
    productKeyword: normalizeProductKeyword(filters.productKeyword),
    includePriceDrops: filters.includePriceDrops ?? true,
    includePriceRises: filters.includePriceRises ?? true,
    includeNewProducts: filters.includeNewProducts ?? true,
  };
}

// 將報告篩選條件轉成 Prisma product where，供 price snapshot 查詢套用分類與關鍵字限制。
export function createRecentPriceReportProductFilter(
  filters: Required<RecentPriceReportFilters>,
): Prisma.ProductWhereInput {
  const keywordFilter = filters.productKeyword
    ? createProductKeywordFilter(filters.productKeyword)
    : {};

  return {
    ...(filters.categoryIgrps.length > 0
      ? {
          sourceCategory: {
            igrp: {
              in: filters.categoryIgrps,
            },
          },
        }
      : {}),
    ...keywordFilter,
  };
}

// 將商品品牌資訊轉成報告子分類；未分類商品保留為 null，避免製造假分類。
export function toProductSubcategory(product: CrawlRunPriceSnapshot["product"]) {
  return product.vendorName
    ? {
        slug: product.vendorSlug,
        displayName: product.vendorName,
      }
    : null;
}

// 依商品分組前次 snapshot，讓 reader 可快速尋找每筆 current snapshot 之前的最近價格。
export function groupPreviousSnapshots(
  snapshots: PreviousPriceSnapshot[],
): Map<string, PreviousPriceSnapshot[]> {
  const groups = new Map<string, PreviousPriceSnapshot[]>();

  for (const snapshot of snapshots) {
    const group = groups.get(snapshot.productId) ?? [];
    group.push(snapshot);
    groups.set(snapshot.productId, group);
  }

  return groups;
}

// 價格變動優先顯示變動幅度大且較新的商品，最後以商品名稱維持穩定排序。
export function comparePriceChanges(
  left: PriceReportPriceChangeItem,
  right: PriceReportPriceChangeItem,
): number {
  const deltaDiff = Math.abs(right.delta) - Math.abs(left.delta);

  if (deltaDiff !== 0) {
    return deltaDiff;
  }

  const timeDiff = right.changedAt.getTime() - left.changedAt.getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.productName.localeCompare(right.productName, "zh-Hant");
}

// 新增商品優先顯示較新的項目，最後以商品名稱維持穩定排序。
export function compareNewProducts(
  left: PriceReportNewProductItem,
  right: PriceReportNewProductItem,
): number {
  const timeDiff = right.firstSeenAt.getTime() - left.firstSeenAt.getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.productName.localeCompare(right.productName, "zh-Hant");
}

function normalizeProductKeyword(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const keyword = normalizeProductKeywordText(value);

  return keyword.length > 0 ? keyword : null;
}

function createProductKeywordFilter(keyword: string): Prisma.ProductWhereInput {
  const groups = parseProductKeywordGroups(keyword);

  if (groups.length === 0) {
    return {};
  }

  if (groups.length === 1) {
    return createProductKeywordGroupFilter(groups[0] ?? []);
  }

  return {
    OR: groups.map((tokens) => createProductKeywordGroupFilter(tokens)),
  };
}

function createProductKeywordGroupFilter(tokens: string[]): Prisma.ProductWhereInput {
  if (tokens.length <= 1) {
    return {
      name: {
        contains: tokens[0] ?? "",
        mode: "insensitive",
      },
    };
  }

  return {
    AND: tokens.map((token) => ({
      name: {
        contains: token,
        mode: "insensitive",
      },
    })),
  };
}

function parseProductKeywordGroups(keyword: string): string[][] {
  return keyword
    .split(",")
    .map((group) => group.trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0);
}

function normalizeProductKeywordText(value: string): string {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((group) => group.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
}
