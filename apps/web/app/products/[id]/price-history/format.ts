// apps/web/app/products/[id]/price-history/format.ts
// 提供價格歷史面板、圖表與變動紀錄共用的顯示文字格式化 helper。

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
  return `${formatPointSource(point.observationType)}，${formatTooltipDate(
    point.observedAt,
  )}，${formatPrice(point.amount)}`;
}

// 將價格歷史金額格式化為圖表與紀錄使用的台幣顯示。
export function formatPrice(amount: number) {
  return `NT$${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

// 將價格差額格式化為帶正負號的台幣顯示；缺值時回傳資料不足。
export function formatSignedPrice(amount: number | null) {
  if (amount === null) {
    return "資料不足";
  }

  if (amount === 0) {
    return "NT$0";
  }

  return `${amount > 0 ? "+" : "-"}${formatPrice(Math.abs(amount))}`;
}

// 將百分比變化格式化為帶正負號的小數百分比；缺值時不顯示。
export function formatSignedPercent(percent: number | null) {
  if (percent === null) {
    return "";
  }

  if (percent === 0) {
    return "0%";
  }

  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

// 將日期壓縮成圖表軸線與摘要卡片使用的月日文字。
export function formatCompactDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

// 將價格變動紀錄時間固定轉成台灣時間的月日與時分。
export function formatRecordDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Taipei",
  }).formatToParts(new Date(value));
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("month")}/${partValue("day")} ${partValue("hour")}:${partValue("minute")}`;
}

// 將 tooltip 時間轉成月日與時分顯示。
export function formatTooltipDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

// 將價格觀測來源轉成圖表、tooltip 與輔助文字可讀的中文標籤。
export function formatPointSource(observationType: PriceHistoryPoint["observationType"]) {
  return observationType === "price_snapshot" ? "價格變動" : "價格確認";
}
