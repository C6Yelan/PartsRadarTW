"use client";
// apps/web/app/build-list/components/BuildListSummaryPanel.tsx
// 集中呈現配單估算、零件構成、主要操作與商品資料狀態。

import { API_RATE_LIMITED_MESSAGE } from "../../_shared/api-client";
import { formatTwdPrice } from "../../_shared/formatting";
import { formatTaipeiDateTime } from "../../_shared/time";
import type { BuildListCategorySummary, BuildListRefreshState, BuildListSummary } from "../model";

export default function BuildListSummaryPanel({
  categories,
  isDownloadDisabled,
  itemCount,
  lastSuccessfulSyncAt,
  onClear,
  onDownloadExcel,
  onRefresh,
  refreshState,
  summary,
}: {
  categories: BuildListCategorySummary[];
  isDownloadDisabled: boolean;
  itemCount: number;
  lastSuccessfulSyncAt: string | null;
  onClear: () => void;
  onDownloadExcel: () => void;
  onRefresh: () => void;
  refreshState: BuildListRefreshState;
  summary: BuildListSummary;
}) {
  const unconfirmedItemCount = summary.missingItemCount + summary.unavailableItemCount;

  return (
    <aside className="build-list-summary" aria-label="配單摘要與操作">
      <section className="build-list-summary-section">
        <h2>配單摘要</h2>
        <div className="build-list-estimated-total">
          <span>預估總價</span>
          <strong>{formatTwdPrice(summary.totalAmount)}</strong>
        </div>
        <dl className="build-list-summary-stats">
          <div>
            <dt>品項數</dt>
            <dd>{summary.itemCount}</dd>
          </div>
          <div>
            <dt>零件數</dt>
            <dd>{summary.totalQuantity}</dd>
          </div>
          {summary.unpricedItemCount > 0 ? (
            <div>
              <dt>暫未計價</dt>
              <dd>{summary.unpricedItemCount}</dd>
            </div>
          ) : null}
          {summary.inactiveItemCount > 0 ? (
            <div>
              <dt>可能已下架</dt>
              <dd>{summary.inactiveItemCount}</dd>
            </div>
          ) : null}
          {unconfirmedItemCount > 0 ? (
            <div>
              <dt>資料待確認</dt>
              <dd>{unconfirmedItemCount}</dd>
            </div>
          ) : null}
        </dl>
        {summary.itemCount === 0 ? (
          <p className="build-list-selection-empty">
            尚未勾選要納入配單摘要與下載的品項。
          </p>
        ) : null}
        <p>價格僅計入目前可確認資料，作為配單估算。</p>
      </section>

      {categories.length > 0 ? (
        <section className="build-list-summary-section build-list-category-summary">
          <h3>零件構成</h3>
          <ul>
            {categories.map((category) => (
              <li
                aria-label={`${category.label}，${category.itemCount} 個品項，共 ${category.totalQuantity} 件`}
                key={category.label}
              >
                <span>{category.label}</span>
                <strong>{category.totalQuantity} 件</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="build-list-summary-section">
        <h3>主要操作</h3>
        <div className="build-list-summary-actions">
          <button
            className="control-button primary"
            disabled={isDownloadDisabled}
            type="button"
            onClick={onDownloadExcel}
          >
            下載 Excel（{summary.itemCount}）
          </button>
          <button
            className="control-button secondary"
            disabled={itemCount === 0 || refreshState === "loading"}
            type="button"
            onClick={onRefresh}
          >
            {refreshState === "loading" ? "正在重新整理" : "重新整理商品資料"}
          </button>
          <button className="build-list-clear-button" type="button" onClick={onClear}>
            清空配單
          </button>
        </div>
      </section>

      <section
        className="build-list-summary-section build-list-data-status"
        aria-label="配單資料狀態"
      >
        <h3>資料狀態</h3>
        <strong>{getRefreshMessage(refreshState, unconfirmedItemCount, itemCount)}</strong>
        <span>
          最近更新：
          {lastSuccessfulSyncAt ? formatTaipeiDateTime(lastSuccessfulSyncAt) : "尚未成功同步"}
        </span>
        <span>價格為目前已確認資料的估算。</span>
        <span>配單只儲存在此瀏覽器，不會跨裝置同步。</span>
      </section>
    </aside>
  );
}

function getRefreshMessage(
  state: BuildListRefreshState,
  unconfirmedItemCount: number,
  itemCount: number,
): string {
  if (itemCount === 0) return "配單目前沒有需要同步的品項。";
  if (state === "loading") return "正在取得最新商品資料。";
  if (state === "rate_limited") return API_RATE_LIMITED_MESSAGE;
  if (state === "error") return "商品資料重新整理失敗，配單內容仍已保留。";
  if (state === "ready" && unconfirmedItemCount > 0) {
    return `已選品項中有 ${unconfirmedItemCount} 個品項暫時無法確認。`;
  }
  if (state === "ready") return "商品資料已更新。";
  return "商品資料尚未同步。";
}
