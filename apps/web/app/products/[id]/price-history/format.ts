// apps/web/app/products/[id]/price-history/format.ts
import type { ChartPoint, PriceHistoryPoint } from "./types";

export function formatHistoryPointCount(pointCount: number) {
  return `${pointCount} 筆價格觀測`;
}

export function getInsufficientDataMessage() {
  return "目前只有單一價格觀測點，尚無可比較區間。";
}

export function getPointAriaLabel(point: ChartPoint) {
  return `${formatPointSource(point.source)}，${formatTooltipDate(point.observedAt)}，${formatPrice(
    point.amount,
  )}`;
}

export function formatPrice(amount: number) {
  return `NT$${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

export function formatSignedPrice(amount: number | null) {
  if (amount === null) {
    return "資料不足";
  }

  if (amount === 0) {
    return "NT$0";
  }

  return `${amount > 0 ? "+" : "-"}${formatPrice(Math.abs(amount))}`;
}

export function formatSignedPercent(percent: number | null) {
  if (percent === null) {
    return "";
  }

  if (percent === 0) {
    return "0%";
  }

  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

export function formatCompactDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

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

export function formatTooltipDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatPointSource(source: PriceHistoryPoint["source"]) {
  return source === "price_snapshot" ? "價格變動" : "價格確認";
}
