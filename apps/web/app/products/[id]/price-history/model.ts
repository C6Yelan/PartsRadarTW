// apps/web/app/products/[id]/price-history/model.ts
import type {
  ChartConfig,
  ChartMarker,
  ChartModel,
  ChartPoint,
  ChartTick,
  HistoryViewSummary,
  PriceChangeRecord,
  PriceHistoryPoint,
  PriceRecordTone,
} from "./types";

export function summarizePoints(points: PriceHistoryPoint[]): HistoryViewSummary {
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

export function createChartModel(
  points: PriceHistoryPoint[],
  summary: HistoryViewSummary,
  chartConfig: ChartConfig,
): ChartModel {
  const firstTime = new Date(points[0]?.observedAt ?? "").getTime();
  const latestTime = new Date(points.at(-1)?.observedAt ?? "").getTime();
  const timeRange = Number.isFinite(latestTime - firstTime) ? latestTime - firstTime : 0;
  const amounts = points.map((point) => point.amount);
  const rawMin = Math.min(...amounts);
  const rawMax = Math.max(...amounts);
  const padding =
    rawMax === rawMin ? Math.max(100, Math.round(rawMax * 0.04)) : (rawMax - rawMin) * 0.12;
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
  const hasRange =
    summary.lowest && summary.highest && summary.lowest.amount !== summary.highest.amount;

  if (hasRange && lowest) {
    markers.push({ key: `lowest-${lowest.key}`, label: "最低", point: lowest, tone: "low" });
  }

  if (hasRange && highest && !markers.some((marker) => marker.point.key === highest.key)) {
    markers.push({ key: `highest-${highest.key}`, label: "最高", point: highest, tone: "high" });
  }

  return markers;
}

function findChartPoint(points: ChartPoint[], point: PriceHistoryPoint) {
  return points.find(
    (candidate) => candidate.observedAt === point.observedAt && candidate.amount === point.amount,
  );
}

function createChangeRecords(points: PriceHistoryPoint[]): PriceChangeRecord[] {
  const records: PriceChangeRecord[] = [];
  let previousPriceSnapshot: PriceHistoryPoint | null = null;

  for (const point of points) {
    if (point.observationType === "current_price_confirmation") {
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
    Math.max(
      Number(
        (((latest.amount - lowest.amount) / (highest.amount - lowest.amount)) * 100).toFixed(2),
      ),
      0,
    ),
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

function getPointKey(point: PriceHistoryPoint) {
  return `${point.observedAt}-${point.amount}-${point.observationType}`;
}

function getPercentChange(amount: number, baseAmount: number) {
  if (baseAmount === 0) {
    return 0;
  }

  return Number((((amount - baseAmount) / baseAmount) * 100).toFixed(2));
}

function minByAmount(points: PriceHistoryPoint[]): PriceHistoryPoint {
  return points.reduce((lowest, point) => (point.amount < lowest.amount ? point : lowest));
}

function maxByAmount(points: PriceHistoryPoint[]): PriceHistoryPoint {
  return points.reduce((highest, point) => (point.amount > highest.amount ? point : highest));
}
