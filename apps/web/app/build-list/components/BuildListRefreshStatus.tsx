"use client";
// apps/web/app/build-list/components/BuildListRefreshStatus.tsx
// 顯示批次 refresh 狀態、最近成功同步時間、手動重整與 browser-only 說明。

import { formatBuildListDateTime } from "../formatting";
import type { BuildListRefreshState } from "../model";

export default function BuildListRefreshStatus({
  itemCount,
  lastSuccessfulSyncAt,
  missingItemCount,
  onRefresh,
  state,
}: {
  itemCount: number;
  lastSuccessfulSyncAt: string | null;
  missingItemCount: number;
  onRefresh: () => void;
  state: BuildListRefreshState;
}) {
  return (
    <section className="build-list-refresh-status" aria-label="配單同步狀態">
      <div>
        <strong>{getRefreshMessage(state, missingItemCount, itemCount)}</strong>
        <span>
          最近成功同步：
          {lastSuccessfulSyncAt ? formatBuildListDateTime(lastSuccessfulSyncAt) : "尚未成功同步"}
        </span>
        <span>配單只儲存在這個瀏覽器，不會跨裝置同步。</span>
      </div>
      <button
        className="control-button secondary"
        disabled={itemCount === 0 || state === "loading"}
        type="button"
        onClick={onRefresh}
      >
        {state === "loading" ? "正在重新整理" : "重新整理商品資料"}
      </button>
    </section>
  );
}

function getRefreshMessage(
  state: BuildListRefreshState,
  missingItemCount: number,
  itemCount: number,
): string {
  if (itemCount === 0) {
    return "配單目前沒有需要同步的品項。";
  }

  if (state === "loading") {
    return "正在取得最新商品資料。";
  }

  if (state === "rate_limited") {
    return "重新整理次數過快，品項暫時無法確認，請稍後再試。";
  }

  if (state === "error") {
    return "商品資料重新整理失敗，配單內容仍已保留。";
  }

  if (state === "ready" && missingItemCount > 0) {
    return `已同步；有 ${missingItemCount} 個品項暫時查不到。`;
  }

  if (state === "ready") {
    return "商品資料已更新。";
  }

  return "商品資料尚未同步。";
}
