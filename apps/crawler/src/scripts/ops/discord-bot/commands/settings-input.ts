// apps/crawler/src/scripts/ops/discord-bot/commands/settings-input.ts
// 驗證並正規化 Discord 設定面板送回的 select value 與 modal 文字輸入。

import { MAX_PRICE_REPORT_KEYWORD_GROUPS, MAX_PRICE_REPORT_KEYWORD_LENGTH } from "../constants";
import {
  PRICE_REPORT_CATEGORY_OPTION_LIMIT,
  PRICE_REPORT_CONTENT_NEW_PRODUCTS_VALUE,
  PRICE_REPORT_CONTENT_PRICE_DROPS_VALUE,
  PRICE_REPORT_CONTENT_PRICE_RISES_VALUE,
} from "./ids";

// 驗證分類 select 回傳值必須來自目前可見分類；空選或全選都代表不限制分類。
export function parsePriceReportCategorySelection(
  values: string[],
  categories: Array<{ igrp: number }>,
): number[] | null {
  const visibleCategories = categories.slice(0, PRICE_REPORT_CATEGORY_OPTION_LIMIT);
  const visibleIgrps = new Set(visibleCategories.map((category) => category.igrp));
  const selectedIgrps = new Set<number>();

  for (const value of values) {
    if (!/^[1-9][0-9]*$/.test(value)) {
      return null;
    }

    const igrp = Number(value);

    if (!visibleIgrps.has(igrp)) {
      return null;
    }

    selectedIgrps.add(igrp);
  }

  if (selectedIgrps.size === 0 || selectedIgrps.size === visibleIgrps.size) {
    return [];
  }

  return [...selectedIgrps].sort((left, right) => left - right);
}

// 嚴格解析報告時間視窗 select value；未知值直接視為無效，避免錯誤 payload 套用預設。
export function parseWindowHoursStrict(value: unknown): number | null {
  if (value === "6h") {
    return 6;
  }

  if (value === "12h") {
    return 12;
  }

  if (value === "24h") {
    return 24;
  }

  return null;
}

// 解析商品關鍵字輸入；null 代表清空，undefined 代表格式或長度不合法。
function parseProductKeywordInput(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const productKeyword = normalizeProductKeywordInput(value);

  if (productKeyword.length === 0) {
    return null;
  }

  return productKeyword.length <= MAX_PRICE_REPORT_KEYWORD_LENGTH &&
    countProductKeywordGroups(productKeyword) <= MAX_PRICE_REPORT_KEYWORD_GROUPS
    ? productKeyword
    : undefined;
}

// 將最多五個 OR 關鍵字欄依序合併成既有逗號分組格式；第一欄仍接受舊 modal 的逗號輸入。
export function parseProductKeywordInputs(values: unknown[]): string | null | undefined {
  if (values.length > MAX_PRICE_REPORT_KEYWORD_GROUPS) {
    return undefined;
  }

  const groups: string[] = [];

  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== "string") {
      return undefined;
    }

    groups.push(value);
  }

  return parseProductKeywordInput(groups.join(","));
}

// 將既有逗號分組格式拆成 modal 的五個輸入欄預填值。
export function splitProductKeywordInputGroups(value: string): string[] {
  return normalizeProductKeywordInput(value)
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean)
    .slice(0, MAX_PRICE_REPORT_KEYWORD_GROUPS);
}

// 解析報告內容篩選 select value，要求至少一種內容類型且不得包含未知值。
export function parseReportContentFilters(values: unknown[]): {
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
} | null {
  const validValues = new Set([
    PRICE_REPORT_CONTENT_PRICE_DROPS_VALUE,
    PRICE_REPORT_CONTENT_PRICE_RISES_VALUE,
    PRICE_REPORT_CONTENT_NEW_PRODUCTS_VALUE,
  ]);

  if (
    values.length === 0 ||
    values.some((value) => typeof value !== "string" || !validValues.has(value))
  ) {
    return null;
  }

  return {
    includePriceDrops: values.includes(PRICE_REPORT_CONTENT_PRICE_DROPS_VALUE),
    includePriceRises: values.includes(PRICE_REPORT_CONTENT_PRICE_RISES_VALUE),
    includeNewProducts: values.includes(PRICE_REPORT_CONTENT_NEW_PRODUCTS_VALUE),
  };
}

// 解析台北時間 HH:mm 輸入，回傳 handler 可直接寫入排程設定的小時與分鐘。
export function parseTimeOfDay(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - "０".charCodeAt(0)))
    .replace(/：/g, ":")
    .replace(/[\s\u3000]*:[\s\u3000]*/g, ":");
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(normalized);

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

// 正規化使用者關鍵字輸入，支援中文逗號並壓平每組關鍵字內的多餘空白。
function normalizeProductKeywordInput(value: string): string {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((group) => group.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
}

// 計算關鍵字逗號分組數，對應 UI 說明與最大組數限制。
function countProductKeywordGroups(keyword: string): number {
  return keyword.split(",").filter((group) => group.trim().length > 0).length;
}
