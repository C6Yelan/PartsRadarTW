"use client";

import { useEffect, useMemo, useState } from "react";

export type PriceHistoryLoadState = "idle" | "loading" | "ready" | "unavailable" | "error";
export type PriceHistoryRangeDays = 7 | 30 | 90;

type PriceSignalTone = "low" | "high" | "middle" | "flat";
type PriceRecordTone = "down" | "up";

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
  averageAmount: number | null;
  rangePositionPercent: number;
  deltaAmount: number | null;
  deltaPercent: number | null;
  signal: {
    label: string;
    tone: PriceSignalTone;
  };
  records: PriceChangeRecord[];
}

interface PriceChangeRecord {
  key: string;
  observedAt: string;
  beforeAmount: number;
  afterAmount: number;
  deltaAmount: number;
  tone: PriceRecordTone;
  label: string;
}

interface ChartPoint extends PriceHistoryPoint {
  key: string;
  percentChange: number;
  x: number;
  y: number;
}

interface ChartTick {
  label: string;
  y: number;
}

interface ChartMarker {
  key: string;
  label: string;
  point: ChartPoint;
  tone: "low" | "high";
}

interface ChartConfig {
  width: number;
  height: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

const RANGE_OPTIONS = [
  { label: "7 天", value: 7 },
  { label: "30 天", value: 30 },
  { label: "90 天", value: 90 },
] as const satisfies readonly { label: string; value: PriceHistoryRangeDays }[];

const DESKTOP_CHART_CONFIG = {
  width: 640,
  height: 196,
  padding: {
    top: 12,
    right: 24,
    bottom: 30,
    left: 50,
  },
} as const satisfies ChartConfig;

const MOBILE_CHART_CONFIG = {
  width: 300,
  height: 260,
  padding: {
    top: 20,
    right: 22,
    bottom: 36,
    left: 50,
  },
} as const satisfies ChartConfig;

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
  const [activePointKey, setActivePointKey] = useState<string | null>(null);
  const chartConfig = useChartConfig();
  const visiblePoints = useMemo(() => history?.points ?? [], [history]);
  const viewSummary = useMemo(() => summarizePoints(visiblePoints), [visiblePoints]);
  const chart = useMemo(
    () =>
      visiblePoints.length >= 2 ? createChartModel(visiblePoints, viewSummary, chartConfig) : null,
    [visiblePoints, viewSummary, chartConfig],
  );
  const activePoint = chart?.points.find((point) => point.key === activePointKey) ?? null;
  const isLoading = state === "idle" || state === "loading";
  const isUnavailable = state === "error" || state === "unavailable" || !history;

  return (
    <section className="history-panel" aria-labelledby="price-history-title">
      <div className="history-topline">
        <div>
          <h2 id="price-history-title">價格走勢</h2>
        </div>
        <HistoryRangeControls
          rangeDays={selectedRangeDays}
          onRangeDaysChange={(days) => {
            setActivePointKey(null);
            onRangeDaysChange(days);
          }}
        />
      </div>

      {isLoading ? (
        <div className="history-loading">
          <span className="skeleton-box history-chart-skeleton" />
        </div>
      ) : null}

      {!isLoading && isUnavailable ? (
        <p className="history-empty">價格歷史暫時無法載入。</p>
      ) : null}

      {!isLoading && !isUnavailable ? (
        <>
          {chart ? (
            <div className="history-insight-grid">
              <PeriodDeltaCard summary={viewSummary} />
              <HistoryRangeCard rangeDays={history.rangeDays} summary={viewSummary} />
            </div>
          ) : null}

          <div className="history-chart-wrap">
            <div className="history-chart-card-header">
              <h3>走勢圖</h3>
            </div>
            {chart ? (
              <>
                <div className="history-chart-stage">
                  <svg
                    className="history-chart"
                    role="img"
                    aria-label={`近 ${history.rangeDays} 天價格走勢圖`}
                    viewBox={`0 0 ${chart.config.width} ${chart.config.height}`}
                  >
                    {chart.ticks.map((tick, index) => (
                      <g className="history-chart-tick" key={tick.label}>
                        <text x={chart.config.padding.left - 8} y={tick.y + 4}>
                          {tick.label}
                        </text>
                        {index < chart.ticks.length - 1 ? (
                          <line
                            x1={chart.config.padding.left}
                            x2={chart.config.width - chart.config.padding.right}
                            y1={tick.y}
                            y2={tick.y}
                          />
                        ) : null}
                      </g>
                    ))}
                    <line
                      className="history-chart-axis-line"
                      x1={chart.config.padding.left}
                      x2={chart.config.padding.left}
                      y1={chart.config.padding.top}
                      y2={chart.config.height - chart.config.padding.bottom}
                    />
                    <line
                      className="history-chart-axis-line history-chart-x-axis-line"
                      x1={chart.config.padding.left}
                      x2={chart.config.width - chart.config.padding.right}
                      y1={chart.config.height - chart.config.padding.bottom}
                      y2={chart.config.height - chart.config.padding.bottom}
                    />
                    <path className="history-chart-area" d={chart.areaPath} />
                    <path className="history-chart-line" d={chart.linePath} />
                    {chart.points.map((point) => (
                      <circle
                        className={`history-chart-point ${
                          point.source === "current_price_confirmation" ? "is-confirmation" : ""
                        } ${activePointKey === point.key ? "is-active" : ""}`}
                        key={point.key}
                        cx={point.x}
                        cy={point.y}
                        r="2.2"
                      />
                    ))}
                  </svg>

                  {chart.markers.map((marker) => (
                    <FixedChartMarker chartConfig={chart.config} key={marker.key} marker={marker} />
                  ))}

                  {chart.points.map((point) => (
                    <button
                      aria-label={getPointAriaLabel(point)}
                      className="history-chart-point-button"
                      key={point.key}
                      style={{
                        left: `${(point.x / chart.config.width) * 100}%`,
                        top: `${(point.y / chart.config.height) * 100}%`,
                      }}
                      type="button"
                      onBlur={() => setActivePointKey(null)}
                      onClick={() => setActivePointKey(point.key)}
                      onFocus={() => setActivePointKey(point.key)}
                      onMouseEnter={() => setActivePointKey(point.key)}
                      onMouseLeave={() => setActivePointKey(null)}
                    />
                  ))}

                  {activePoint ? <HistoryTooltip chartConfig={chart.config} point={activePoint} /> : null}
                </div>
                <div className="history-chart-axis" aria-hidden="true">
                  <span>{formatCompactDate(viewSummary.startedAt)}</span>
                  <span>{formatCompactDate(viewSummary.endedAt)}</span>
                </div>
              </>
            ) : (
              <div className="history-chart-stage history-chart-stage-empty">
                <p className="history-empty history-chart-empty-text">
                  {getInsufficientDataMessage()}
                </p>
              </div>
            )}
          </div>

          {chart ? <HistoryRecordList records={viewSummary.records} /> : null}
        </>
      ) : null}
    </section>
  );
}

function HistoryRangeControls({
  rangeDays,
  onRangeDaysChange,
}: {
  rangeDays: PriceHistoryRangeDays;
  onRangeDaysChange(days: PriceHistoryRangeDays): void;
}) {
  return (
    <fieldset className="history-controls history-range-controls">
      <legend className="sr-only">價格走勢時間範圍</legend>
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
  );
}

function useChartConfig() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateChartConfig = () => setIsMobile(mediaQuery.matches);

    updateChartConfig();
    mediaQuery.addEventListener("change", updateChartConfig);

    return () => mediaQuery.removeEventListener("change", updateChartConfig);
  }, []);

  return isMobile ? MOBILE_CHART_CONFIG : DESKTOP_CHART_CONFIG;
}

function PeriodDeltaCard({ summary }: { summary: HistoryViewSummary }) {
  return (
    <div className={`history-period-card is-${summary.signal.tone}`}>
      <span>期間變動</span>
      <strong>{`${formatSignedPrice(summary.deltaAmount)} / ${formatSignedPercent(
        summary.deltaPercent,
      )}`}</strong>
      <small>{summary.signal.label}</small>
    </div>
  );
}

function HistoryRangeCard({
  rangeDays,
  summary,
}: {
  rangeDays: PriceHistoryRangeDays;
  summary: HistoryViewSummary;
}) {
  if (!summary.lowest || !summary.highest || !summary.latest) {
    return null;
  }

  return (
    <div className="history-range-card">
      <div className="history-range-heading">
        <strong>{rangeDays} 天摘要</strong>
        <span>{formatHistoryPointCount(summary.pointCount)}</span>
      </div>
      <div className="history-range-track-wrap">
        <span className="history-range-caption">價格區間</span>
        <div className="history-range-endpoints">
          <span className="history-range-endpoint is-low">
            <span>最低</span>
            <strong>{formatPrice(summary.lowest.amount)}</strong>
          </span>
          <span className="history-range-endpoint is-high">
            <span>最高</span>
            <strong>{formatPrice(summary.highest.amount)}</strong>
          </span>
        </div>
        <div className="history-range-track" aria-hidden="true">
          <span
            className="history-range-marker"
            style={{ left: `${summary.rangePositionPercent}%` }}
          />
        </div>
      </div>
      <div className="history-range-stats">
        <div className="history-range-stat is-low">
          <span>最低</span>
          <strong>{formatPrice(summary.lowest.amount)}</strong>
          <small>{formatCompactDate(summary.lowest.observedAt)}</small>
        </div>
        <div className="history-range-stat is-high">
          <span>最高</span>
          <strong>{formatPrice(summary.highest.amount)}</strong>
          <small>{formatCompactDate(summary.highest.observedAt)}</small>
        </div>
        <div className="history-range-stat is-average">
          <span>均價</span>
          <strong>{summary.averageAmount === null ? "-" : formatPrice(summary.averageAmount)}</strong>
          <small>區間平均</small>
        </div>
      </div>
    </div>
  );
}

function FixedChartMarker({
  chartConfig,
  marker,
}: {
  chartConfig: ChartConfig;
  marker: ChartMarker;
}) {
  return (
    <div
      className={`history-chart-marker is-${marker.tone}`}
      style={{
        left: `${(marker.point.x / chartConfig.width) * 100}%`,
        top: `${(marker.point.y / chartConfig.height) * 100}%`,
      }}
    >
      <span>{marker.label}</span>
      <strong>{formatPrice(marker.point.amount)}</strong>
    </div>
  );
}

function HistoryTooltip({
  chartConfig,
  point,
}: {
  chartConfig: ChartConfig;
  point: ChartPoint;
}) {
  const left = `${Math.min(Math.max((point.x / chartConfig.width) * 100, 12), 88)}%`;
  const top = `${(point.y / chartConfig.height) * 100}%`;

  return (
    <div className="history-tooltip" style={{ left, top }}>
      <span>{formatTooltipDate(point.observedAt)}</span>
      <strong>{formatPrice(point.amount)}</strong>
      <small>{`${formatPointSource(point.source)} · ${formatSignedPercent(point.percentChange)}`}</small>
    </div>
  );
}

function HistoryRecordList({ records }: { records: PriceChangeRecord[] }) {
  if (records.length === 0) {
    return null;
  }

  return (
    <div className="history-records">
      <h3>變價紀錄</h3>
      <div className="history-record-list">
        {records.slice(0, 5).map((record) => (
          <div className="history-record-row" key={record.key}>
            <time dateTime={record.observedAt}>{formatCompactDate(record.observedAt)}</time>
            <span className="history-record-price">
              {`${formatPrice(record.beforeAmount)} -> ${formatPrice(record.afterAmount)}`}
            </span>
            <strong className={`is-${record.tone}`}>{formatSignedPrice(record.deltaAmount)}</strong>
            <span className={`history-record-badge is-${record.tone}`}>{record.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function summarizePoints(points: PriceHistoryPoint[]): HistoryViewSummary {
  const first = points[0] ?? null;
  const latest = points.at(-1) ?? null;
  const lowest = points.length > 0 ? minByAmount(points) : null;
  const highest = points.length > 0 ? maxByAmount(points) : null;
  const averageAmount =
    points.length > 0
      ? Math.round(points.reduce((total, point) => total + point.amount, 0) / points.length)
      : null;
  const deltaAmount = first && latest && points.length >= 2 ? latest.amount - first.amount : null;
  const deltaPercent =
    deltaAmount !== null && first && first.amount !== 0
      ? Number(((deltaAmount / first.amount) * 100).toFixed(2))
      : null;
  const rangePositionPercent = getRangePositionPercent(lowest, highest, latest);
  const signal = getPriceSignal({ deltaAmount, highest, latest, lowest, rangePositionPercent });

  return {
    pointCount: points.length,
    startedAt: first?.observedAt ?? null,
    endedAt: latest?.observedAt ?? null,
    lowest,
    highest,
    first,
    latest,
    averageAmount,
    rangePositionPercent,
    deltaAmount,
    deltaPercent,
    signal,
    records: createChangeRecords(points),
  };
}

function createChartModel(
  points: PriceHistoryPoint[],
  summary: HistoryViewSummary,
  chartConfig: ChartConfig,
) {
  const firstTime = new Date(points[0]?.observedAt ?? "").getTime();
  const latestTime = new Date(points.at(-1)?.observedAt ?? "").getTime();
  const timeRange = Number.isFinite(latestTime - firstTime) ? latestTime - firstTime : 0;
  const amounts = points.map((point) => point.amount);
  const rawMin = Math.min(...amounts);
  const rawMax = Math.max(...amounts);
  const padding = rawMax === rawMin ? Math.max(100, Math.round(rawMax * 0.04)) : (rawMax - rawMin) * 0.12;
  const minValue = Math.max(0, rawMin - padding);
  const maxValue = rawMax + padding;
  const valueRange = maxValue - minValue || 1;
  const baseAmount = points[0]?.amount ?? 0;
  const innerWidth = chartConfig.width - chartConfig.padding.left - chartConfig.padding.right;
  const innerHeight = chartConfig.height - chartConfig.padding.top - chartConfig.padding.bottom;
  const bottomY = chartConfig.height - chartConfig.padding.bottom;
  const scaledPoints: ChartPoint[] = points.map((point, index) => {
    const observedTime = new Date(point.observedAt).getTime();
    const x =
      timeRange === 0 || !Number.isFinite(observedTime)
        ? chartConfig.padding.left + (index / Math.max(points.length - 1, 1)) * innerWidth
        : chartConfig.padding.left + ((observedTime - firstTime) / timeRange) * innerWidth;
    const y = chartConfig.padding.top + ((maxValue - point.amount) / valueRange) * innerHeight;

    return {
      ...point,
      key: getPointKey(point),
      percentChange: getPercentChange(point.amount, baseAmount),
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  });
  const linePath = createStepPath(scaledPoints);
  const firstPoint = scaledPoints[0];
  const latestPoint = scaledPoints.at(-1);
  const areaPath =
    firstPoint && latestPoint
      ? `${linePath} L ${latestPoint.x} ${bottomY} L ${firstPoint.x} ${bottomY} Z`
      : "";

  return {
    areaPath,
    config: chartConfig,
    linePath,
    markers: createChartMarkers(scaledPoints, summary),
    points: scaledPoints,
    ticks: createChartTicks({ chartConfig, maxValue, minValue }),
  };
}

function createStepPath(points: ChartPoint[]) {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint, ...restPoints] = points;
  let path = `M ${firstPoint.x} ${firstPoint.y}`;
  let previousPoint = firstPoint;

  for (const point of restPoints) {
    path += ` H ${point.x} V ${point.y}`;
    previousPoint = point;
  }

  return previousPoint ? path : "";
}

function createChartTicks({
  chartConfig,
  maxValue,
  minValue,
}: {
  chartConfig: ChartConfig;
  maxValue: number;
  minValue: number;
}): ChartTick[] {
  const values = [maxValue, (maxValue + minValue) / 2, minValue];

  return values.map((value) => ({
    label: new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(Math.round(value)),
    y: Number(
      (
        chartConfig.padding.top +
        ((maxValue - value) / (maxValue - minValue || 1)) *
          (chartConfig.height - chartConfig.padding.top - chartConfig.padding.bottom)
      ).toFixed(2),
    ),
  }));
}

function createChartMarkers(points: ChartPoint[], summary: HistoryViewSummary): ChartMarker[] {
  const markers: ChartMarker[] = [];
  const lowest = summary.lowest ? findChartPoint(points, summary.lowest) : null;
  const highest = summary.highest ? findChartPoint(points, summary.highest) : null;
  const hasRange = summary.lowest && summary.highest && summary.lowest.amount !== summary.highest.amount;

  if (hasRange && lowest) {
    markers.push({ key: `lowest-${lowest.key}`, label: "最低", point: lowest, tone: "low" });
  }

  if (hasRange && highest && !markers.some((marker) => marker.point.key === highest.key)) {
    markers.push({ key: `highest-${highest.key}`, label: "最高", point: highest, tone: "high" });
  }

  return markers;
}

function findChartPoint(points: ChartPoint[], point: PriceHistoryPoint) {
  return points.find((candidate) => candidate.observedAt === point.observedAt && candidate.amount === point.amount);
}

function createChangeRecords(points: PriceHistoryPoint[]): PriceChangeRecord[] {
  const records: PriceChangeRecord[] = [];
  let previousPriceSnapshot: PriceHistoryPoint | null = null;

  for (const point of points) {
    if (point.source === "current_price_confirmation") {
      continue;
    }

    if (!previousPriceSnapshot) {
      previousPriceSnapshot = point;
      continue;
    }

    const deltaAmount = point.amount - previousPriceSnapshot.amount;
    if (deltaAmount === 0) {
      previousPriceSnapshot = point;
      continue;
    }

    records.push({
      key: getPointKey(point),
      observedAt: point.observedAt,
      beforeAmount: previousPriceSnapshot.amount,
      afterAmount: point.amount,
      deltaAmount,
      tone: getRecordTone(deltaAmount),
      label: getRecordLabel(deltaAmount),
    });
    previousPriceSnapshot = point;
  }

  return records.reverse();
}

function getRangePositionPercent(
  lowest: PriceHistoryPoint | null,
  highest: PriceHistoryPoint | null,
  latest: PriceHistoryPoint | null,
) {
  if (!lowest || !highest || !latest || lowest.amount === highest.amount) {
    return 50;
  }

  return Math.min(
    Math.max(Number((((latest.amount - lowest.amount) / (highest.amount - lowest.amount)) * 100).toFixed(2)), 0),
    100,
  );
}

function getPriceSignal({
  deltaAmount,
  highest,
  latest,
  lowest,
  rangePositionPercent,
}: {
  deltaAmount: number | null;
  highest: PriceHistoryPoint | null;
  latest: PriceHistoryPoint | null;
  lowest: PriceHistoryPoint | null;
  rangePositionPercent: number;
}): HistoryViewSummary["signal"] {
  if (!lowest || !highest || !latest || lowest.amount === highest.amount) {
    return { label: "持平", tone: "flat" };
  }

  if (rangePositionPercent <= 35) {
    return { label: deltaAmount && deltaAmount < 0 ? "偏低" : "低位", tone: "low" };
  }

  if (rangePositionPercent >= 65) {
    return { label: deltaAmount && deltaAmount > 0 ? "偏高" : "高位", tone: "high" };
  }

  return { label: "中段", tone: "middle" };
}

function getRecordTone(deltaAmount: number): PriceRecordTone {
  if (deltaAmount > 0) {
    return "up";
  }

  return "down";
}

function getRecordLabel(deltaAmount: number) {
  if (deltaAmount > 0) {
    return "上漲";
  }

  return "下跌";
}

function formatHistoryPointCount(pointCount: number) {
  return `${pointCount} 筆價格觀測`;
}

function getInsufficientDataMessage() {
  return "目前只有單一價格觀測點，尚無可比較區間。";
}

function getPointAriaLabel(point: ChartPoint) {
  return `${formatPointSource(point.source)}，${formatTooltipDate(point.observedAt)}，${formatPrice(
    point.amount,
  )}`;
}

function getPointKey(point: PriceHistoryPoint) {
  return `${point.observedAt}-${point.amount}-${point.source}`;
}

function getPercentChange(amount: number, baseAmount: number) {
  if (baseAmount === 0) {
    return 0;
  }

  return Number((((amount - baseAmount) / baseAmount) * 100).toFixed(2));
}

function formatPrice(amount: number) {
  return `NT$${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

function formatSignedPrice(amount: number | null) {
  if (amount === null) {
    return "資料不足";
  }

  if (amount === 0) {
    return "NT$0";
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

function minByAmount(points: PriceHistoryPoint[]): PriceHistoryPoint {
  return points.reduce((lowest, point) => (point.amount < lowest.amount ? point : lowest));
}

function maxByAmount(points: PriceHistoryPoint[]): PriceHistoryPoint {
  return points.reduce((highest, point) => (point.amount > highest.amount ? point : highest));
}
