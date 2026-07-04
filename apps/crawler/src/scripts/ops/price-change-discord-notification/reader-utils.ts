// apps/crawler/src/scripts/ops/price-change-discord-notification/reader-utils.ts

import type { Prisma } from "@partsradar/db";
import type {
  CrawlRunPriceSnapshot,
  PreviousPriceSnapshot,
  PriceChangeDiscordNotificationItem,
  PriceReportNewProductItem,
  RecentPriceReportFilters,
} from "./types";

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

export function toProductSubcategory(product: CrawlRunPriceSnapshot["product"]) {
  return product.vendorName
    ? {
        slug: product.vendorSlug,
        displayName: product.vendorName,
      }
    : null;
}

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

export function comparePriceChanges(
  left: PriceChangeDiscordNotificationItem,
  right: PriceChangeDiscordNotificationItem,
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
