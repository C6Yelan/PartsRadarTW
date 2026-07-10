"use client";
// apps/web/app/build-list/components/BuildListSummaryPanel.tsx
// 顯示當次 refresh 可確認的配單估算、未計價數量與匯出／清空入口。

import { formatBuildListPrice } from "../formatting";
import type { BuildListSummary } from "../model";

export default function BuildListSummaryPanel({
  isDownloadDisabled,
  onClear,
  onDownloadExcel,
  summary,
}: {
  isDownloadDisabled: boolean;
  onClear: () => void;
  onDownloadExcel: () => void;
  summary: BuildListSummary;
}) {
  return (
    <aside className="build-list-summary" aria-label="配單總計">
      <dl>
        <div>
          <dt>品項</dt>
          <dd>{summary.itemCount}</dd>
        </div>
        <div>
          <dt>數量</dt>
          <dd>{summary.totalQuantity}</dd>
        </div>
        <div>
          <dt>未計價品項</dt>
          <dd>{summary.unpricedItemCount}</dd>
        </div>
        <div className="build-list-total-row">
          <dt>總價</dt>
          <dd>{formatBuildListPrice(summary.totalAmount)}</dd>
        </div>
      </dl>

      <p>
        {summary.unpricedItemCount > 0
          ? `配單總價僅計入目前有價格的品項；另有 ${summary.unpricedItemCount} 個品項暫未計價。`
          : "配單總價為目前已確認價格的估算。"}
      </p>

      <div className="build-list-summary-actions">
        <button
          className="control-button primary"
          disabled={isDownloadDisabled}
          type="button"
          onClick={onDownloadExcel}
        >
          下載 Excel
        </button>
        <button className="control-button secondary" type="button" onClick={onClear}>
          清空配單
        </button>
      </div>
    </aside>
  );
}
