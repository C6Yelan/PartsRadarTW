// apps/crawler/src/scripts/ops/discord-bot/watch/list-state.ts
import type {
  TargetPriceWatchListRecord,
  TargetPriceWatchlistResult,
} from "./records";
import type { TargetPriceWatchSortKey, TargetPriceWatchStatusFilter } from "../types";

export function normalizeWatchStatusFilter(
  statusFilter: TargetPriceWatchStatusFilter,
): TargetPriceWatchStatusFilter {
  return statusFilter === "reached" || statusFilter === "unreached" ? statusFilter : "all";
}

export function normalizeWatchSortKey(sortKey: TargetPriceWatchSortKey): TargetPriceWatchSortKey {
  return sortKey === "target" || sortKey === "current" ? sortKey : "recent";
}

export function matchesWatchStatusFilter(
  watch: TargetPriceWatchListRecord,
  statusFilter: TargetPriceWatchStatusFilter,
): boolean {
  if (statusFilter === "all") {
    return true;
  }

  const reached = isWatchTargetReached(watch);

  return statusFilter === "reached" ? reached : !reached;
}

export function sortTargetPriceWatches(
  watches: TargetPriceWatchListRecord[],
  sortKey: TargetPriceWatchSortKey,
): TargetPriceWatchListRecord[] {
  const sortedWatches = [...watches];

  if (sortKey === "target") {
    return sortedWatches.sort(
      (left, right) =>
        left.targetPrice - right.targetPrice ||
        right.updatedAt.getTime() - left.updatedAt.getTime() ||
        left.id.localeCompare(right.id),
    );
  }

  if (sortKey === "current") {
    return sortedWatches.sort((left, right) => {
      const leftPrice = getWatchCurrentPrice(left);
      const rightPrice = getWatchCurrentPrice(right);

      if (leftPrice === null && rightPrice === null) {
        return left.id.localeCompare(right.id);
      }

      if (leftPrice === null) {
        return 1;
      }

      if (rightPrice === null) {
        return -1;
      }

      return leftPrice - rightPrice || left.id.localeCompare(right.id);
    });
  }

  return sortedWatches.sort(
    (left, right) =>
      right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id),
  );
}

function isWatchTargetReached(watch: TargetPriceWatchListRecord): boolean {
  const currentPrice = getWatchCurrentPrice(watch);

  return currentPrice !== null && currentPrice <= watch.targetPrice;
}

function getWatchCurrentPrice(watch: TargetPriceWatchListRecord): number | null {
  return watch.product.currentPrice?.priceSnapshot.price ?? null;
}

export function formatWatchListState({
  page,
  statusFilter,
  sortKey,
}: {
  page: number;
  statusFilter: TargetPriceWatchStatusFilter;
  sortKey: TargetPriceWatchSortKey;
}): string {
  return `${page}:${statusFilter}:${sortKey}`;
}

export function formatWatchListDisplayState(result: TargetPriceWatchlistResult): string {
  return `顯示：${formatWatchStatusFilterLabel(result.statusFilter)}；排序：${formatWatchSortLabel(
    result.sortKey,
  )}；符合 ${result.filteredCount}/${result.totalCount} 項`;
}

function formatWatchStatusFilterLabel(statusFilter: TargetPriceWatchStatusFilter): string {
  if (statusFilter === "reached") {
    return "已達標";
  }

  if (statusFilter === "unreached") {
    return "未達標";
  }

  return "全部";
}

function formatWatchSortLabel(sortKey: TargetPriceWatchSortKey): string {
  if (sortKey === "target") {
    return "目標價低到高";
  }

  if (sortKey === "current") {
    return "目前價格低到高";
  }

  return "最近更新";
}
