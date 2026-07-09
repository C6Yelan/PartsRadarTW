// apps/web/app/products/[id]/price-history/types.ts
// 定義商品價格歷史 API 回應、前端摘要模型與 SVG 圖表模型的共用型別。

export type PriceHistoryLoadState = "idle" | "loading" | "ready" | "unavailable" | "error";
export type PriceHistoryRangeDays = 7 | 30 | 90;
export type PriceHistoryRange = PriceHistoryRangeDays | "all";
export type PriceHistoryRangeKey = "7d" | "30d" | "90d" | "all";
export type PriceSignalTone = "low" | "high" | "middle" | "flat";
export type PriceRecordTone = "down" | "up";
export type PriceHistoryObservationType = "price_snapshot" | "current_price_confirmation";

// 商品價格歷史 API 的前端消費契約，包含原始 points 與目前仍回傳的相容 summary。
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

// 價格歷史圖使用的單一觀測點；source 目前保留為 observationType 的相容 alias。
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

// 前端從 API points 重新彙整出的畫面摘要，供摘要卡、區間軸與變價紀錄共用。
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

// 僅代表實際價格快照之間的漲跌紀錄，不包含單純價格確認點。
export interface PriceChangeRecord {
  key: string;
  observedAt: string;
  beforeAmount: number;
  afterAmount: number;
  deltaAmount: number;
  tone: PriceRecordTone;
  label: string;
}

// 經過 chart model 轉換後的圖表點位，加入 SVG 座標與相對首筆價格變化。
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

// SVG 價格歷史圖的尺寸與內距設定，供座標換算與 overlay 定位共用。
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

// 價格歷史圖的完整呈現模型，集中提供 SVG path、座標點、刻度與高低點標記。
export interface ChartModel {
  areaPath: string;
  config: ChartConfig;
  linePath: string;
  markers: ChartMarker[];
  points: ChartPoint[];
  ticks: ChartTick[];
}
