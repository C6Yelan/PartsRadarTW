"use client";
// apps/web/app/products/[id]/price-history/records.tsx
// 顯示價格歷史中的實際漲跌紀錄，並在紀錄較多時提供本機分頁。

import { useState } from "react";
import { formatSignedTwdPrice, formatTwdPrice } from "../../../_shared/formatting";
import { formatTaipeiMonthDayTime } from "../../../_shared/time";
import type { PriceChangeRecord } from "./types";

// 限制單頁變價紀錄數，避免商品詳細頁的價格歷史區塊過長。
const HISTORY_RECORD_PAGE_SIZE = 5;

// 呈現價格變動紀錄列表，將分頁狀態保留在價格歷史面板內部。
export function HistoryRecordList({ records }: { records: PriceChangeRecord[] }) {
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.ceil(records.length / HISTORY_RECORD_PAGE_SIZE);
  const safePageIndex = Math.min(pageIndex, Math.max(pageCount - 1, 0));
  const visibleRecords = records.slice(
    safePageIndex * HISTORY_RECORD_PAGE_SIZE,
    (safePageIndex + 1) * HISTORY_RECORD_PAGE_SIZE,
  );

  if (records.length === 0) {
    return null;
  }

  return (
    <div className="history-records">
      <div className="history-record-heading">
        <h3>變價紀錄</h3>
        {pageCount > 1 ? <span>{`${records.length} 筆`}</span> : null}
      </div>
      <div className="history-record-list">
        {visibleRecords.map((record) => (
          <div className="history-record-row" key={record.key}>
            <time dateTime={record.observedAt}>{formatTaipeiMonthDayTime(record.observedAt)}</time>
            <span className="history-record-price">
              {`${formatTwdPrice(record.beforeAmount)} ➙ ${formatTwdPrice(record.afterAmount)}`}
            </span>
            <strong className={`is-${record.tone}`}>
              {formatSignedTwdPrice(record.deltaAmount, "資料不足")}
            </strong>
            <span className={`history-record-badge is-${record.tone}`}>{record.label}</span>
          </div>
        ))}
      </div>
      {pageCount > 1 ? (
        <nav className="history-record-pagination" aria-label="變價紀錄頁數">
          <button
            disabled={safePageIndex === 0}
            type="button"
            onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
          >
            上一頁
          </button>
          <span>{`${safePageIndex + 1} / ${pageCount}`}</span>
          <button
            disabled={safePageIndex >= pageCount - 1}
            type="button"
            onClick={() => setPageIndex((current) => Math.min(current + 1, pageCount - 1))}
          >
            下一頁
          </button>
        </nav>
      ) : null}
    </div>
  );
}
