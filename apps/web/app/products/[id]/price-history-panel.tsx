"use client";

import { useMemo, useState } from "react";

export type PriceHistoryLoadState = "idle" | "loading" | "ready" | "unavailable" | "error";
export type PriceHistoryRangeDays = 7 | 30 | 90;

type PriceHistoryDisplayMode = "price" | "percent";
type PriceHistorySourceMode = "all" | "changes";

export interface ProductPriceHistoryBody {
  productId: string;
  rangeDays: PriceHistoryRangeDays;
  points: PriceHistoryPoint[];
  summary: {
    pointCount: number;
    startedAt: string | null;
    endedAt: string | null;
    lowest: PriceHistorySummaryPoint | null;
    highest: PriceHistorySummaryPoint | null;
    first: PriceHistorySummaryPoint | null;
    latest: PriceHistorySummaryPoint | null;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
}

interface PriceHistoryPoint {
  amount: number;
  currency: "TWD";
  observedAt: string;
  source: "price_snapshot" | "current_price_confirmation";
}

interface PriceHistorySummaryPoint {
  amount: number;
  observedAt: string;
}

interface HistoryViewSummary {
  pointCount: number;
  startedAt: string | null;
  endedAt: string | null;
  lowest: PriceHistoryPoint | null;
  highest: PriceHistoryPoint | null;
  first: PriceHistoryPoint | null;
  latest: PriceHistoryPoint | null;
  deltaAmount: number | null;
  deltaPercent: number | null;
}

interface ChartPoint extends PriceHistoryPoint {
  key: string;
  chartValue: number;
  percentChange: number;
  x: number;
  y: number;
}

const RANGE_OPTIONS = [
  { label: "7 天", value: 7 },
  { label: "30 天", value: 30 },
  { label: "90 天", value: 90 },
] as const satisfies readonly { label: string; value: PriceHistoryRangeDays }[];

const DISPLAY_MODE_OPTIONS = [
  { label: "價格", value: "price" },
  { label: "漲跌幅", value: "percent" },
] as const satisfies readonly { label: string; value: PriceHistoryDisplayMode }[];

const SOURCE_MODE_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "變價", value: "changes" },
] as const satisfies readonly { label: string; value: PriceHistorySourceMode }[];

export default function PriceHistoryPanel({
  history,
  selectedRangeDays,
  state,
  onRangeDaysChange,
}: {
  history: ProductPriceHistoryBody | null;
  selectedRangeDays: PriceHistoryRangeDays;
  state: PriceHistoryLoadState;
  onRangeDaysChange(days: PriceHistoryRangeDays): void;
}) {
  const [displayMode, setDisplayMode] = useState<PriceHistoryDisplayMode>("price");
  const [sourceMode, setSourceMode] = useState<PriceHistorySourceMode>("all");
  const [activePointKey, setActivePointKey] = useState<string | null>(null);
  const visiblePoints = useMemo(
    () => filterHistoryPoints(history?.points ?? [], sourceMode),
    [history, sourceMode],
  );
  const viewSummary = useMemo(() => summarizePoints(visiblePoints), [visiblePoints]);
  const chartPoints = useMemo(
    () => (visiblePoints.length >= 2 ? createChartPoints(visiblePoints, displayMode) : null),
    [visiblePoints, displayMode],
  );
  const activePoint = chartPoints?.points.find((point) => point.key === activePointKey) ?? null;
  const isLoading = state === "idle" || state === "loading";
  const isUnavailable = state === "error" || state === "unavailable" || !history;

  return (
    <section className="history-panel" aria-labelledby="price-history-title">
      <div className="history-header">
        <div>
          <h2 id="price-history-title">價格走勢</h2>
          <p>{getHistorySubtitle({ history, isLoading, selectedRangeDays, sourceMode, viewSummary })}</p>
        </div>
        {viewSummary.deltaAmount !== null ? (
          <HistoryDelta displayMode={displayMode} summary={viewSummary} />
        ) : null}
      </div>

      <HistoryControls
        displayMode={displayMode}
        rangeDays={selectedRangeDays}
        sourceMode={sourceMode}
        onDisplayModeChange={setDisplayMode}
        onRangeDaysChange={(days) => {
          setActivePointKey(null);
          onRangeDaysChange(days);
        }}
        onSourceModeChange={(mode) => {
          setActivePointKey(null);
          setSourceMode(mode);
        }}
      />

      {isLoading ? (
        <div className="history-loading">
          <span className="skeleton-box history-chart-skeleton" />
        </div>
      ) : null}

      {!isLoading && isUnavailable ? (
        <p className="history-empty">價格歷史暫時無法載入。</p>
      ) : null}

      {!isLoading && !isUnavailable && visiblePoints.length < 2 ? (
        <p className="history-empty">{getInsufficientDataMessage(sourceMode)}</p>
      ) : null}

      {!isLoading && !isUnavailable && chartPoints && viewSummary.lowest && viewSummary.highest && viewSummary.latest ? (
        <>
          <div className="history-metrics">
            <HistoryMetric
              displayMode={displayMode}
              label="目前"
              point={viewSummary.latest}
              summary={viewSummary}
            />
            <HistoryMetric
              displayMode={displayMode}
              label="最低"
              point={viewSummary.lowest}
              summary={viewSummary}
            />
            <HistoryMetric
              displayMode={displayMode}
              label="最高"
              point={viewSummary.highest}
              summary={viewSummary}
            />
          </div>

          <div className="history-chart-wrap">
            <div className="history-chart-stage">
              <svg
                className="history-chart"
                role="img"
                aria-label={`近 ${history.rangeDays} 天價格走勢圖`}
                viewBox="0 0 640 180"
              >
                <line className="history-chart-grid" x1="20" x2="620" y1="28" y2="28" />
                <line className="history-chart-grid" x1="20" x2="620" y1="152" y2="152" />
                <polyline className="history-chart-line" points={chartPoints.line} />
                {chartPoints.points.map((point) => (
                  <circle
                    className={`history-chart-point ${
                      point.source === "current_price_confirmation" ? "is-confirmation" : ""
                    } ${activePointKey === point.key ? "is-active" : ""}`}
                    key={point.key}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                  />
                ))}
              </svg>
              {chartPoints.points.map((point) => (
                <button
                  aria-label={getPointAriaLabel(point, displayMode)}
                  className="history-chart-point-button"
                  key={point.key}
                  style={{
                    left: `${(point.x / 640) * 100}%`,
                    top: `${(point.y / 180) * 100}%`,
                  }}
                  type="button"
                  onBlur={() => setActivePointKey(null)}
                  onClick={() => setActivePointKey(point.key)}
                  onFocus={() => setActivePointKey(point.key)}
                  onMouseEnter={() => setActivePointKey(point.key)}
                  onMouseLeave={() => setActivePointKey(null)}
                />
              ))}
              {activePoint ? (
                <HistoryTooltip displayMode={displayMode} point={activePoint} />
              ) : null}
            </div>
            <div className="history-chart-axis" aria-hidden="true">
              <span>{formatCompactDate(viewSummary.startedAt)}</span>
              <span>{formatCompactDate(viewSummary.endedAt)}</span>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function HistoryControls({
  displayMode,
  rangeDays,
  sourceMode,
  onDisplayModeChange,
  onRangeDaysChange,
  onSourceModeChange,
}: {
  displayMode: PriceHistoryDisplayMode;
  rangeDays: PriceHistoryRangeDays;
  sourceMode: PriceHistorySourceMode;
  onDisplayModeChange(mode: PriceHistoryDisplayMode): void;
  onRangeDaysChange(days: PriceHistoryRangeDays): void;
  onSourceModeChange(mode: PriceHistorySourceMode): void;
}) {
  return (
    <div className="history-controls">
      <fieldset className="history-control-group">
        <legend>時間</legend>
        <div className="segmented-control history-segmented history-range-control">
          {RANGE_OPTIONS.map((option) => (
            <button
              aria-pressed={rangeDays === option.value}
              className={rangeDays === option.value ? "is-active" : ""}
              key={option.value}
              type="button"
              onClick={() => onRangeDaysChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="history-control-group">
        <legend>模式</legend>
        <div className="segmented-control history-segmented history-mode-control">
          {DISPLAY_MODE_OPTIONS.map((option) => (
            <button
              aria-pressed={displayMode === option.value}
              className={displayMode === option.value ? "is-active" : ""}
              key={option.value}
              type="button"
              onClick={() => onDisplayModeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="history-control-group">
        <legend>觀測點</legend>
        <div className="segmented-control history-segmented history-source-control">
          {SOURCE_MODE_OPTIONS.map((option) => (
            <button
              aria-pressed={sourceMode === option.value}
              className={sourceMode === option.value ? "is-active" : ""}
              key={option.value}
              type="button"
              onClick={() => onSourceModeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function HistoryDelta({
  displayMode,
  summary,
}: {
  displayMode: PriceHistoryDisplayMode;
  summary: HistoryViewSummary;
}) {
  const deltaClass = getDeltaClass(summary.deltaAmount);

  return (
    <div className={`history-delta ${deltaClass}`}>
      <span>區間變化</span>
      <strong>
        {displayMode === "price"
          ? formatSignedPrice(summary.deltaAmount)
          : formatSignedPercent(summary.deltaPercent)}
      </strong>
      <small>
        {displayMode === "price"
          ? formatSignedPercent(summary.deltaPercent)
          : formatSignedPrice(summary.deltaAmount)}
      </small>
    </div>
  );
}

function HistoryMetric({
  displayMode,
  label,
  point,
  summary,
}: {
  displayMode: PriceHistoryDisplayMode;
  label: string;
  point: PriceHistoryPoint;
  summary: HistoryViewSummary;
}) {
  const percentChange = getPointPercentChange(point, summary.first);

  return (
    <div className={label === "目前" ? "is-primary" : ""}>
      <span>{label}</span>
      <strong>{formatPrice(point.amount)}</strong>
      <small>
        {displayMode === "price"
          ? formatCompactDate(point.observedAt)
          : `${formatSignedPercent(percentChange)} · ${formatCompactDate(point.observedAt)}`}
      </small>
    </div>
  );
}

function HistoryTooltip({
  displayMode,
  point,
}: {
  displayMode: PriceHistoryDisplayMode;
  point: ChartPoint;
}) {
  const left = `${Math.min(Math.max((point.x / 640) * 100, 12), 88)}%`;
  const top = `${(point.y / 180) * 100}%`;

  return (
    <div className="history-tooltip" style={{ left, top }}>
      <span>{formatTooltipDate(point.observedAt)}</span>
      <strong>{formatPrice(point.amount)}</strong>
      <small>
        {displayMode === "price"
          ? `${formatPointSource(point.source)} · ${formatSignedPercent(point.percentChange)}`
          : `${formatPointSource(point.source)} · ${formatSignedPercent(point.percentChange)}`}
      </small>
    </div>
  );
}

function filterHistoryPoints(
  points: PriceHistoryPoint[],
  sourceMode: PriceHistorySourceMode,
): PriceHistoryPoint[] {
  if (sourceMode === "changes") {
    return points.filter((point) => point.source === "price_snapshot");
  }

  return points;
}

function summarizePoints(points: PriceHistoryPoint[]): HistoryViewSummary {
  const first = points[0] ?? null;
  const latest = points.at(-1) ?? null;
  const lowest = points.length > 0 ? minByAmount(points) : null;
  const highest = points.length > 0 ? maxByAmount(points) : null;
  const deltaAmount = first && latest && points.length >= 2 ? latest.amount - first.amount : null;
  const deltaPercent =
    deltaAmount !== null && first && first.amount !== 0
      ? Number(((deltaAmount / first.amount) * 100).toFixed(2))
      : null;

  return {
    pointCount: points.length,
    startedAt: first?.observedAt ?? null,
    endedAt: latest?.observedAt ?? null,
    lowest,
    highest,
    first,
    latest,
    deltaAmount,
    deltaPercent,
  };
}

function createChartPoints(points: PriceHistoryPoint[], displayMode: PriceHistoryDisplayMode) {
  const width = 640;
  const height = 180;
  const paddingX = 20;
  const paddingY = 28;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const firstTime = new Date(points[0]?.observedAt ?? "").getTime();
  const latestTime = new Date(points.at(-1)?.observedAt ?? "").getTime();
  const timeRange = Number.isFinite(latestTime - firstTime) ? latestTime - firstTime : 0;
  const baseAmount = points[0]?.amount ?? 0;
  const displayValues = points.map((point) => getChartValue(point, baseAmount, displayMode));
  const minValue = Math.min(...displayValues);
  const maxValue = Math.max(...displayValues);
  const valueRange = maxValue - minValue;

  const scaledPoints = points.map((point, index) => {
    const observedTime = new Date(point.observedAt).getTime();
    const x =
      timeRange === 0 || !Number.isFinite(observedTime)
        ? paddingX + (index / Math.max(points.length - 1, 1)) * innerWidth
        : paddingX + ((observedTime - firstTime) / timeRange) * innerWidth;
    const chartValue = getChartValue(point, baseAmount, displayMode);
    const y =
      valueRange === 0
        ? height / 2
        : paddingY + ((maxValue - chartValue) / valueRange) * innerHeight;

    return {
      ...point,
      chartValue,
      key: getPointKey(point),
      percentChange: getPercentChange(point.amount, baseAmount),
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  });

  return {
    line: scaledPoints.map((point) => `${point.x},${point.y}`).join(" "),
    points: scaledPoints,
  };
}

function getChartValue(
  point: PriceHistoryPoint,
  baseAmount: number,
  displayMode: PriceHistoryDisplayMode,
) {
  if (displayMode === "percent") {
    return getPercentChange(point.amount, baseAmount);
  }

  return point.amount;
}

function getHistorySubtitle({
  history,
  isLoading,
  selectedRangeDays,
  sourceMode,
  viewSummary,
}: {
  history: ProductPriceHistoryBody | null;
  isLoading: boolean;
  selectedRangeDays: PriceHistoryRangeDays;
  sourceMode: PriceHistorySourceMode;
  viewSummary: HistoryViewSummary;
}) {
  if (isLoading || !history) {
    return `近 ${selectedRangeDays} 天`;
  }

  const pointLabel = sourceMode === "changes" ? "筆變價紀錄" : "筆價格觀測";

  return `近 ${history.rangeDays} 天，${viewSummary.pointCount} ${pointLabel}`;
}

function getInsufficientDataMessage(sourceMode: PriceHistorySourceMode) {
  if (sourceMode === "changes") {
    return "目前只有單一變價紀錄，尚無可比較區間。";
  }

  return "目前只有單一價格觀測點，尚無可比較區間。";
}

function getPointAriaLabel(point: ChartPoint, displayMode: PriceHistoryDisplayMode) {
  const value =
    displayMode === "price" ? formatPrice(point.amount) : formatSignedPercent(point.percentChange);

  return `${formatPointSource(point.source)}，${formatTooltipDate(point.observedAt)}，${value}`;
}

function getPointKey(point: PriceHistoryPoint) {
  return `${point.observedAt}-${point.amount}-${point.source}`;
}

function getPointPercentChange(point: PriceHistoryPoint, first: PriceHistoryPoint | null) {
  return getPercentChange(point.amount, first?.amount ?? 0);
}

function getPercentChange(amount: number, baseAmount: number) {
  if (baseAmount === 0) {
    return 0;
  }

  return Number((((amount - baseAmount) / baseAmount) * 100).toFixed(2));
}

function formatPrice(amount: number) {
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

function formatSignedPrice(amount: number | null) {
  if (amount === null) {
    return "資料不足";
  }

  if (amount === 0) {
    return "NT$ 0";
  }

  return `${amount > 0 ? "+" : "-"}${formatPrice(Math.abs(amount))}`;
}

function formatSignedPercent(percent: number | null) {
  if (percent === null) {
    return "";
  }

  if (percent === 0) {
    return "0%";
  }

  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

function formatCompactDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTooltipDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatPointSource(source: PriceHistoryPoint["source"]) {
  return source === "price_snapshot" ? "價格變動" : "價格確認";
}

function getDeltaClass(amount: number | null) {
  if (amount === null || amount === 0) {
    return "is-flat";
  }

  return amount > 0 ? "is-up" : "is-down";
}

function minByAmount(points: PriceHistoryPoint[]): PriceHistoryPoint {
  return points.reduce((lowest, point) => (point.amount < lowest.amount ? point : lowest));
}

function maxByAmount(points: PriceHistoryPoint[]): PriceHistoryPoint {
  return points.reduce((highest, point) => (point.amount > highest.amount ? point : highest));
}
