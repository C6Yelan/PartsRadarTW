// apps/web/app/price-report/components/PriceReportResults.tsx
// 顯示價格變動摘要、來源狀態、結果列與分頁控制。

"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { API_RATE_LIMITED_MESSAGE } from "../../_shared/api-client";
import { formatInteger, formatSignedTwdPrice, formatTwdPrice } from "../../_shared/formatting";
import { formatTaipeiDateTime } from "../../_shared/time";
import { Pagination } from "../../product-explorer/components/Pagination";
import { ProductImage } from "../../product-explorer/components/ProductImage";
import { getVisiblePages, toDigitsOnly } from "../../product-explorer/query-state";
import type { PriceReportLoadState, PriceReportResponse, PriceReportResponseItem } from "../types";

interface PriceReportResultsProps {
  report: PriceReportResponse | null;
  returnTo: string;
  state: PriceReportLoadState;
  onPageChange: (page: number) => void;
}

export function PriceReportResults({
  report,
  returnTo,
  state,
  onPageChange,
}: PriceReportResultsProps) {
  const [pageJumpValue, setPageJumpValue] = useState("");
  const summary = report?.summary ?? {
    dropCount: 0,
    riseCount: 0,
    newProductCount: 0,
  };

  function submitPageJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const page = Number(pageJumpValue);

    if (report && Number.isSafeInteger(page) && page >= 1 && page <= report.pagination.totalPages) {
      onPageChange(page);
      setPageJumpValue("");
    }
  }

  return (
    <>
      <section className="price-report-summary" aria-label="價格變動摘要">
        <SummaryItem className="is-drop" label="降價" value={summary.dropCount} />
        <SummaryItem className="is-rise" label="漲價" value={summary.riseCount} />
        <SummaryItem className="is-new" label="新品" value={summary.newProductCount} />
      </section>

      <section className="price-report-results" aria-label="價格變動列表">
        <div className="price-report-results-heading">
          <h2>每項商品在範圍內的最近一次變動</h2>
          {report ? <span>{formatInteger(report.pagination.totalItems)} 筆</span> : null}
        </div>

        {report?.meta.sourceStatus === "ok" ? (
          <p className="price-report-source-status" role="status">
            資料最後成功更新：
            {formatTaipeiDateTime(report.meta.lastSuccessAt, "尚無紀錄")}
          </p>
        ) : null}
        {report?.meta.sourceStatus === "stale" ? (
          <p className="price-report-source-warning" role="status">
            資料可能過期或部分分類尚未成功，最後成功更新：
            {formatTaipeiDateTime(report.meta.lastSuccessAt, "尚無紀錄")}
          </p>
        ) : null}
        {report?.meta.sourceStatus === "unavailable" ? (
          <p className="price-report-source-warning is-unavailable" role="status">
            目前無法確認來源資料的新鮮度，以下內容可能不完整。
          </p>
        ) : null}

        {state === "loading" ? <PriceReportSkeleton /> : null}
        {state === "rate_limited" ? (
          <p className="price-report-empty" role="alert">
            {API_RATE_LIMITED_MESSAGE}
          </p>
        ) : null}
        {state === "error" ? (
          <p className="price-report-empty" role="alert">
            價格變動暫時無法載入，請稍後再試。
          </p>
        ) : null}
        {state === "ready" && report?.data.length === 0 ? (
          <p className="price-report-empty">這個範圍沒有符合條件的價格變動</p>
        ) : null}
        {state === "ready" && report && report.data.length > 0 ? (
          <>
            <div className="price-report-table-header" aria-hidden="true">
              <span>商品</span>
              <span>分類</span>
              <span>前次價格</span>
              <span>目前價格</span>
              <span>漲跌金額</span>
              <span>漲跌比例</span>
              <span>變動時間</span>
            </div>
            <div className="price-report-rows">
              {report.data.map((item) => (
                <PriceReportRow
                  item={item}
                  key={`${item.kind}:${item.productId}`}
                  returnTo={returnTo}
                />
              ))}
            </div>
          </>
        ) : null}

        {state === "ready" && report && report.pagination.totalPages > 1 ? (
          <Pagination
            page={report.pagination.page}
            pageJumpValue={pageJumpValue}
            productState={state}
            shouldShowPageJump={report.pagination.totalPages > 7}
            totalPages={report.pagination.totalPages}
            visiblePages={getVisiblePages(report.pagination.page, report.pagination.totalPages)}
            onGoToPage={onPageChange}
            onJumpSubmit={submitPageJump}
            onPageJumpValueChange={(value) => setPageJumpValue(toDigitsOnly(value))}
          />
        ) : null}
      </section>
    </>
  );
}

function SummaryItem({
  className = "",
  label,
  value,
}: {
  className?: string;
  label: string;
  value: number;
}) {
  return (
    <div className={`price-report-summary-item ${className}`.trim()}>
      <span>{label}</span>
      <strong>{formatInteger(value)}</strong>
    </div>
  );
}

function PriceReportRow({ item, returnTo }: { item: PriceReportResponseItem; returnTo: string }) {
  return (
    <article className={`price-report-row is-${item.kind}`}>
      <div className="price-report-product">
        <ProductImage fallbackLabel={item.category.displayName} image={item.image} />
        <div className="price-report-product-copy">
          <Link href={`/products/${item.productId}?returnTo=${encodeURIComponent(returnTo)}`}>
            {item.productName}
          </Link>
        </div>
      </div>
      <ReportValue
        area="category"
        label="分類"
        value={formatCategoryLabel(item.category.displayName)}
      />
      <ReportValue
        area="previous"
        label="前次價格"
        value={item.previousPrice === null ? "—" : formatTwdPrice(item.previousPrice)}
      />
      <ReportValue area="current" label="目前價格" value={formatTwdPrice(item.currentPrice)} />
      <ReportValue
        area="amount"
        className="price-report-change"
        label="漲跌金額"
        value={item.deltaAmount === null ? "—" : formatSignedTwdPrice(item.deltaAmount)}
      />
      <ReportValue
        area="percent"
        className="price-report-change"
        label="漲跌比例"
        value={formatSignedPercent(item.deltaPercent)}
      />
      <ReportValue
        area="changed"
        label="變動時間"
        value={formatTaipeiDateTime(item.changedAt, "—")}
      />
    </article>
  );
}

function ReportValue({
  area,
  className = "",
  label,
  value,
}: {
  area: string;
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`price-report-value price-report-${area} ${className}`.trim()}>
      <span className="price-report-cell-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PriceReportSkeleton() {
  return (
    <div className="price-report-skeleton">
      <p className="sr-only">載入價格變動中</p>
      {[0, 1, 2].map((row) => (
        <span key={row} />
      ))}
    </div>
  );
}

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCategoryLabel(value: string): string {
  return value.replaceAll(/\s*\/\s*/g, "／");
}
