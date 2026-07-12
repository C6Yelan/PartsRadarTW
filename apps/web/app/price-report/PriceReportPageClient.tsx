// apps/web/app/price-report/PriceReportPageClient.tsx
// 協調價格報告 URL、唯讀 API 載入、篩選控制與結果顯示。

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { isRateLimitedApiError } from "../_shared/api-client";
import { ArrowLeftIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";
import TopbarBrandNavigation from "../TopbarBrandNavigation";
import { fetchPriceReport, fetchPriceReportCategories } from "./api";
import { PriceReportFilters } from "./components/PriceReportFilters";
import { PriceReportResults } from "./components/PriceReportResults";
import {
  DEFAULT_PRICE_REPORT_QUERY,
  normalizePriceReportTypes,
  readPriceReportQuery,
  toPriceReportUrl,
} from "./query-state";
import type {
  PriceReportCategory,
  PriceReportLoadState,
  PriceReportQuery,
  PriceReportResponse,
  PriceReportSort,
  PriceReportType,
  PriceReportWindow,
} from "./types";

export default function PriceReportPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serializedSearch = searchParams.toString();
  const query = useMemo(
    () => readPriceReportQuery(new URLSearchParams(serializedSearch)),
    [serializedSearch],
  );
  const [draftKeyword, setDraftKeyword] = useState(query.q);
  const [categories, setCategories] = useState<PriceReportCategory[]>([]);
  const [report, setReport] = useState<PriceReportResponse | null>(null);
  const [state, setState] = useState<PriceReportLoadState>("loading");

  useEffect(() => {
    setDraftKeyword(query.q);
  }, [query.q]);

  useEffect(() => {
    const controller = new AbortController();

    fetchPriceReportCategories(controller.signal)
      .then(setCategories)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCategories([]);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setState("loading");

    fetchPriceReport(query, controller.signal)
      .then((nextReport) => {
        setReport(nextReport);
        setState("ready");

        if (nextReport.pagination.page !== query.page) {
          router.replace(toPriceReportUrl({ ...query, page: nextReport.pagination.page }), {
            scroll: false,
          });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setReport(null);
        setState(isRateLimitedApiError(error) ? "rate_limited" : "error");
      });

    return () => controller.abort();
  }, [query, router]);

  function commitQuery(nextQuery: PriceReportQuery) {
    router.push(toPriceReportUrl(nextQuery), { scroll: false });
  }

  function updateQuery(patch: Partial<PriceReportQuery>) {
    commitQuery({ ...query, ...patch, page: 1 });
  }

  function toggleType(type: PriceReportType) {
    if (query.types.includes(type) && query.types.length === 1) {
      return;
    }

    const nextTypes = query.types.includes(type)
      ? query.types.filter((selectedType) => selectedType !== type)
      : [...query.types, type];
    updateQuery({ types: normalizePriceReportTypes(nextTypes) });
  }

  function submitKeyword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateQuery({ q: draftKeyword.trim().slice(0, 100) });
  }

  function resetQuery() {
    setDraftKeyword("");
    commitQuery(DEFAULT_PRICE_REPORT_QUERY);
  }

  return (
    <div className="app-shell price-report-shell">
      <header className="topbar price-report-topbar">
        <TopbarBrandNavigation />

        <div className="price-report-topbar-title">
          <h1>價格變動總覽</h1>
          <span>近期零組件漲跌與新品</span>
        </div>

        <Link className="back-link price-report-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="price-report-page">
        <PriceReportFilters
          categories={categories}
          draftKeyword={draftKeyword}
          query={query}
          onCategoryChange={(category) => updateQuery({ category })}
          onDraftKeywordChange={setDraftKeyword}
          onKeywordSubmit={submitKeyword}
          onReset={resetQuery}
          onSortChange={(sort: PriceReportSort) => updateQuery({ sort })}
          onTypeToggle={toggleType}
          onWindowChange={(window: PriceReportWindow) => updateQuery({ window })}
        />
        <PriceReportResults
          report={report}
          returnTo={toPriceReportUrl(query)}
          state={state}
          onPageChange={(page) => commitQuery({ ...query, page })}
        />
      </main>

      <SiteDisclaimer />
    </div>
  );
}
