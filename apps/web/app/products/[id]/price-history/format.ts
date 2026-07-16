// apps/web/app/products/[id]/price-history/format.ts
// 提供價格歷史面板、圖表與變動紀錄共用的顯示文字格式化 helper。

import { formatTwdPrice } from "../../../_shared/formatting";
import { formatTaipeiMonthDayTime } from "../../../_shared/time";
import type { ChartPoint, PriceHistoryPoint } from "./types";

// 將價格觀測點數轉成摘要卡片使用的中文文字。
export function formatHistoryPointCount(pointCount: number) {
  return `${pointCount} 筆價格觀測`;
}

// 回傳價格歷史資料不足時的圖表空狀態訊息。
export function getInsufficientDataMessage() {
  return "目前只有單一價格觀測點，尚無可比較區間。";
}

// 建立價格圖互動點位的 aria-label，包含觀測來源、時間與金額。
export function getPointAriaLabel(point: ChartPoint) {
  return `${formatPointSource(point.observationType)}，${formatTaipeiMonthDayTime(
    point.observedAt,
  )}，${formatTwdPrice(point.amount)}`;
}

// 將價格觀測來源轉成圖表、tooltip 與輔助文字可讀的中文標籤。
export function formatPointSource(observationType: PriceHistoryPoint["observationType"]) {
  return observationType === "price_snapshot" ? "價格變動" : "價格確認";
}
