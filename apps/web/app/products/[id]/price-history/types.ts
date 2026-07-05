// apps/web/app/products/[id]/price-history/types.ts
export type PriceHistoryLoadState = "idle" | "loading" | "ready" | "unavailable" | "error";
export type PriceHistoryRangeDays = 7 | 30 | 90;
export type PriceHistoryRange = PriceHistoryRangeDays | "all";
export type PriceHistoryRangeKey = "7d" | "30d" | "90d" | "all";
export type PriceSignalTone = "low" | "high" | "middle" | "flat";
export type PriceRecordTone = "down" | "up";
export type PriceHistoryObservationType = "price_snapshot" | "current_price_confirmation";

export interface ProductPriceHistoryBody {
  productId: string;
  range: PriceHistoryRangeKey;
  rangeDays: PriceHistoryRangeDays | null;
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

export interface PriceHistoryPoint {
  amount: number;
  currency: "TWD";
  observedAt: string;
  observationType: PriceHistoryObservationType;
  source: PriceHistoryObservationType;
}

export interface PriceHistorySummaryPoint {
  amount: number;
  observedAt: string;
}

export interface HistoryViewSummary {
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

export interface PriceChangeRecord {
  key: string;
  observedAt: string;
  beforeAmount: number;
  afterAmount: number;
  deltaAmount: number;
  tone: PriceRecordTone;
  label: string;
}

export interface ChartPoint extends PriceHistoryPoint {
  key: string;
  percentChange: number;
  x: number;
  y: number;
}

export interface ChartTick {
  label: string;
  y: number;
}

export interface ChartMarker {
  key: string;
  label: string;
  point: ChartPoint;
  tone: "low" | "high";
}

export interface ChartConfig {
  width: number;
  height: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface ChartModel {
  areaPath: string;
  config: ChartConfig;
  linePath: string;
  markers: ChartMarker[];
  points: ChartPoint[];
  ticks: ChartTick[];
}
