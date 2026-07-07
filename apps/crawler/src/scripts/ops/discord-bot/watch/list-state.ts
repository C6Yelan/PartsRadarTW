// apps/crawler/src/scripts/ops/discord-bot/watch/list-state.ts
// 管理目標價 watch 清單的篩選、排序與 Discord custom_id 狀態字串格式。

import type {
  TargetPriceWatchListRecord,
  TargetPriceWatchlistResult,
} from "./records";
import type { TargetPriceWatchSortKey, TargetPriceWatchStatusFilter } from "../types";

// 將外部傳入的 watch 狀態篩選值收斂成清單支援的安全值。
export function normalizeWatchStatusFilter(
  statusFilter: TargetPriceWatchStatusFilter,
): TargetPriceWatchStatusFilter {
  return statusFilter === "reached" || statusFilter === "unreached" ? statusFilter : "all";
}

// 將外部傳入的 watch 排序值收斂成清單支援的安全值。
export function normalizeWatchSortKey(sortKey: TargetPriceWatchSortKey): TargetPriceWatchSortKey {
  return sortKey === "target" || sortKey === "current" ? sortKey : "recent";
}

// 判斷單筆 watch 是否符合目前管理清單的狀態篩選。
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

// 依管理清單目前排序模式排列 watch，保留穩定 fallback 避免相同值時順序跳動。
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

// 將 watch 管理清單狀態壓成 custom_id 片段，讓翻頁、選取與返回操作能保留畫面狀態。
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

// 建立管理面板摘要文字，讓使用者知道目前篩選、排序與符合筆數。
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
