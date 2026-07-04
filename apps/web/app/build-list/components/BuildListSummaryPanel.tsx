"use client";
// apps/web/app/build-list/components/BuildListSummaryPanel.tsx

import { formatBuildListPrice } from "../formatting";
import type { BuildListSummary } from "../model";

export default function BuildListSummaryPanel({
  onClear,
  onDownloadExcel,
  summary,
}: {
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
        <div className="build-list-total-row">
          <dt>總價</dt>
          <dd>{formatBuildListPrice(summary.totalAmount)}</dd>
        </div>
      </dl>

      <p>價格以網站最後收錄資料為準；實際商品資訊、價格、庫存、購買與售後仍以原價屋來源頁為準。</p>

      <div className="build-list-summary-actions">
        <button className="control-button primary" type="button" onClick={onDownloadExcel}>
          下載 Excel
        </button>
        <button className="control-button secondary" type="button" onClick={onClear}>
          清空配單
        </button>
      </div>
    </aside>
  );
}
