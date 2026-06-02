"use client";
// apps/web/app/products/[id]/price-history-panel.tsx

import { useMemo, useState } from "react";
import { PriceHistoryChart, useChartConfig } from "./price-history/chart";
import { createChartModel, summarizePoints } from "./price-history/model";
import { HistoryRecordList } from "./price-history/records";
import { HistoryRangeCard, PeriodDeltaCard } from "./price-history/summary-cards";
import type {
  PriceHistoryLoadState,
  PriceHistoryRange,
  ProductPriceHistoryBody,
} from "./price-history/types";

export type {
  PriceHistoryLoadState,
  PriceHistoryRange,
  PriceHistoryRangeDays,
  ProductPriceHistoryBody,
} from "./price-history/types";

const RANGE_OPTIONS = [
  { label: "7 天", value: 7 },
  { label: "30 天", value: 30 },
  { label: "90 天", value: 90 },
  { label: "全部", value: "all" },
] as const satisfies readonly { label: string; value: PriceHistoryRange }[];

export default function PriceHistoryPanel({
  history,
  selectedRange,
  state,
  onRangeChange,
}: {
  history: ProductPriceHistoryBody | null;
  selectedRange: PriceHistoryRange;
  state: PriceHistoryLoadState;
  onRangeChange(range: PriceHistoryRange): void;
}) {
  const [activePointKey, setActivePointKey] = useState<string | null>(null);
  const chartConfig = useChartConfig();
  const visiblePoints = useMemo(() => history?.points ?? [], [history]);
  const viewSummary = useMemo(() => summarizePoints(visiblePoints), [visiblePoints]);
  const chart = useMemo(
    () =>
      visiblePoints.length >= 2 ? createChartModel(visiblePoints, viewSummary, chartConfig) : null,
    [visiblePoints, viewSummary, chartConfig],
  );
  const isLoading = state === "idle" || state === "loading";
  const isInitialLoading = isLoading && !history;
  const isUnavailable = state === "error" || state === "unavailable" || (!isLoading && !history);

  return (
    <section className="history-panel" aria-busy={isLoading} aria-labelledby="price-history-title">
      <div className="history-topline">
        <div>
          <h2 id="price-history-title">價格走勢</h2>
        </div>
        <HistoryRangeControls
          range={selectedRange}
          onRangeChange={(range) => {
            setActivePointKey(null);
            onRangeChange(range);
          }}
        />
      </div>

      {isInitialLoading ? (
        <div className="history-loading">
          <span className="skeleton-box history-chart-skeleton" />
        </div>
      ) : null}

      {!isLoading && isUnavailable ? (
        <p className="history-empty">價格歷史暫時無法載入。</p>
      ) : null}

      {history && !isUnavailable ? (
        <>
          {chart ? (
            <div className="history-insight-grid">
              <PeriodDeltaCard summary={viewSummary} />
              <HistoryRangeCard
                range={history.range}
                rangeDays={history.rangeDays}
                summary={viewSummary}
              />
            </div>
          ) : null}

          <PriceHistoryChart
            activePointKey={activePointKey}
            chart={chart}
            range={history.range}
            rangeDays={history.rangeDays}
            summary={viewSummary}
            onActivePointKeyChange={setActivePointKey}
          />

          {chart ? <HistoryRecordList key={history.range} records={viewSummary.records} /> : null}
        </>
      ) : null}
    </section>
  );
}

function HistoryRangeControls({
  range,
  onRangeChange,
}: {
  range: PriceHistoryRange;
  onRangeChange(nextRange: PriceHistoryRange): void;
}) {
  return (
    <fieldset className="history-controls history-range-controls">
      <legend className="sr-only">價格走勢時間範圍</legend>
      <div className="segmented-control history-segmented history-range-control">
        {RANGE_OPTIONS.map((option) => (
          <button
            aria-pressed={range === option.value}
            className={range === option.value ? "is-active" : ""}
            key={option.value}
            type="button"
            onClick={() => onRangeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
