// apps/web/app/api/source-status/response.ts
// 將來源分類 freshness 與可見商品狀態轉成 public source-status response。

import { COOLPC_SOURCE_NAME } from "@partsradar/shared";

import type { SourceStatusCategoryRecord } from "./data";

const SOURCE_STALE_THRESHOLD_MS = 60 * 60 * 1000;

export type SourceStatus = "ok" | "stale" | "unavailable";

// 單一來源分類在 source-status API 中回傳的狀態摘要。
interface SourceStatusCategoryResponseItem {
  igrp: number;
  displayName: string;
  sourceName: string;
  status: SourceStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}

// source-status API 的完整 public response contract。
export interface SourceStatusResponseBody {
  source: typeof COOLPC_SOURCE_NAME;
  status: SourceStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  categories: SourceStatusCategoryResponseItem[];
}

// 組裝全域與各分類的來源狀態；產品列表 meta 也共用此判斷邏輯。
export function buildSourceStatusResponse(
  categories: SourceStatusCategoryRecord[],
  now: Date,
): SourceStatusResponseBody {
  const categoryItems = categories.map((category) => toCategoryResponseItem(category, now));

  return {
    source: COOLPC_SOURCE_NAME,
    status: resolveGlobalStatus(categoryItems),
    lastCheckedAt: toIsoStringOrNull(
      latestDate(categories.map((category) => category.lastCheckedAt)),
    ),
    lastSuccessAt: toIsoStringOrNull(
      oldestDate(categories.map((category) => category.lastSuccessAt)),
    ),
    categories: categoryItems,
  };
}

// 將單一分類轉成 public response item，並用可見商品與成功時間判斷分類狀態。
function toCategoryResponseItem(
  category: SourceStatusCategoryRecord,
  now: Date,
): SourceStatusCategoryResponseItem {
  return {
    igrp: category.igrp,
    displayName: category.displayName,
    sourceName: category.sourceName,
    status: resolveCategoryStatus(category, now),
    lastCheckedAt: toIsoStringOrNull(category.lastCheckedAt),
    lastSuccessAt: toIsoStringOrNull(category.lastSuccessAt),
  };
}

// 沒有可見商品視為 unavailable；有商品但成功時間超過門檻則視為 stale。
function resolveCategoryStatus(category: SourceStatusCategoryRecord, now: Date): SourceStatus {
  const hasVisibleProduct = category.products.length > 0;

  if (!hasVisibleProduct) {
    return "unavailable";
  }

  if (
    category.lastSuccessAt &&
    now.getTime() - category.lastSuccessAt.getTime() <= SOURCE_STALE_THRESHOLD_MS
  ) {
    return "ok";
  }

  return "stale";
}

// 全分類都 ok 才回 ok；只要還有非 unavailable 分類，就保留 stale 表示來源仍有部分資料。
function resolveGlobalStatus(categories: SourceStatusCategoryResponseItem[]): SourceStatus {
  if (categories.length > 0 && categories.every((category) => category.status === "ok")) {
    return "ok";
  }

  if (categories.some((category) => category.status !== "unavailable")) {
    return "stale";
  }

  return "unavailable";
}

// 取最近一次檢查時間，用於表示來源狀態資料最新被檢查到何時。
function latestDate(values: Array<Date | null>): Date | null {
  const dates = values.filter((value): value is Date => value !== null);

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

// 取最早的成功時間，避免全域 lastSuccessAt 掩蓋落後分類。
function oldestDate(values: Array<Date | null>): Date | null {
  const dates = values.filter((value): value is Date => value !== null);

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
