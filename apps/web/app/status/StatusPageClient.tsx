// apps/web/app/status/StatusPageClient.tsx
// 讀取既有 source-status API，呈現全域與各分類的公開資料新鮮度。

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  API_RATE_LIMITED_MESSAGE,
  isRateLimitedApiError,
  toApiRequestError,
} from "../_shared/api-client";
import { formatTaipeiDateTime } from "../_shared/time";
import { ArrowLeftIcon, BrandMarkIcon } from "../_shared/icons";
import type { SourceStatusResponseBody } from "../api/source-status/response";
import SiteDisclaimer from "../site-disclaimer";

type StatusLoadState = "loading" | "ready" | "error" | "rate_limited";
type SourceStatus = SourceStatusResponseBody["status"];

const STATUS_COPY: Record<SourceStatus, { label: string; description: string }> = {
  ok: {
    label: "更新正常",
    description: "所有啟用分類都有可顯示商品，且最近一次成功更新仍在新鮮度範圍內。",
  },
  stale: {
    label: "部分資料需留意",
    description: "至少一個分類的成功更新已超過一小時，或部分分類目前沒有可確認的新鮮資料。",
  },
  unavailable: {
    label: "暫無可用狀態",
    description: "目前沒有足夠資料確認來源更新狀態，商品資訊可能不完整。",
  },
};

export default function StatusPageClient() {
  const [report, setReport] = useState<SourceStatusResponseBody | null>(null);
  const [state, setState] = useState<StatusLoadState>("loading");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/source-status", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw await toApiRequestError(response, "資料更新狀態暫時無法載入");
        }

        return (await response.json()) as SourceStatusResponseBody;
      })
      .then((body) => {
        setReport(body);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setReport(null);
        setState(isRateLimitedApiError(error) ? "rate_limited" : "error");
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell public-info-shell">
      <header className="topbar public-info-topbar">
        <Link className="brand-lockup" href="/">
          <BrandMarkIcon />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>
        <div className="public-info-topbar-title">
          <h1>資料更新狀態</h1>
          <span>來源檢查與分類新鮮度</span>
        </div>
        <Link className="back-link public-info-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="public-info-page status-page">
        <section className="public-info-hero">
          <strong>直接查看各商品分類最近一次成功更新狀態。</strong>
          <p>狀態來自既有資料庫紀錄，不會額外向原價屋或其他網站發出查詢。</p>
        </section>

        {state === "loading" ? (
          <section className="public-info-section status-loading" role="status">
            正在讀取資料更新狀態
          </section>
        ) : null}
        {state === "rate_limited" ? (
          <section className="public-info-section status-loading" role="alert">
            {API_RATE_LIMITED_MESSAGE}
          </section>
        ) : null}
        {state === "error" ? (
          <section className="public-info-section status-loading" role="alert">
            資料更新狀態暫時無法載入，請稍後重新整理頁面。
          </section>
        ) : null}
        {state === "ready" && report ? <StatusReport report={report} /> : null}
      </main>

      <SiteDisclaimer />
    </div>
  );
}

function StatusReport({ report }: { report: SourceStatusResponseBody }) {
  const copy = STATUS_COPY[report.status];

  return (
    <>
      <section className={`status-overview is-${report.status}`} aria-labelledby="status-title">
        <div className="status-overview-heading">
          <div>
            <h2 id="status-title">原價屋資料來源</h2>
          </div>
          <span className={`status-badge is-${report.status}`}>{copy.label}</span>
        </div>
        <p>{copy.description}</p>
        <dl className="status-meta">
          <div>
            <dt>最後檢查</dt>
            <dd>{formatTaipeiDateTime(report.lastCheckedAt, "尚無紀錄")}</dd>
          </div>
          <div>
            <dt>最早成功更新</dt>
            <dd>{formatTaipeiDateTime(report.lastSuccessAt, "尚無紀錄")}</dd>
          </div>
        </dl>
      </section>

      <section className="public-info-section" aria-labelledby="category-status-title">
        <h2 id="category-status-title">分類狀態</h2>
        {report.categories.length > 0 ? (
          <div className="status-category-grid">
            {report.categories.map((category) => {
              const categoryCopy = STATUS_COPY[category.status];

              return (
                <article
                  className={`status-category-card is-${category.status}`}
                  key={category.igrp}
                >
                  <header>
                    <div>
                      <h3>{category.displayName}</h3>
                      <span>{category.sourceName}</span>
                    </div>
                    <span className={`status-badge is-${category.status}`}>
                      {categoryCopy.label}
                    </span>
                  </header>
                  <dl className="status-meta">
                    <div>
                      <dt>最後檢查</dt>
                      <dd>{formatTaipeiDateTime(category.lastCheckedAt, "尚無紀錄")}</dd>
                    </div>
                    <div>
                      <dt>成功更新</dt>
                      <dd>{formatTaipeiDateTime(category.lastSuccessAt, "尚無紀錄")}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <p>目前沒有啟用分類可供顯示。</p>
        )}
      </section>
    </>
  );
}
