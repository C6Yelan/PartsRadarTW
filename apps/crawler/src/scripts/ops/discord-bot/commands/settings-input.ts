// apps/crawler/src/scripts/ops/discord-bot/commands/settings-input.ts

import {
  MAX_PRICE_REPORT_ITEMS,
  MAX_PRICE_REPORT_KEYWORD_GROUPS,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
} from "../constants";
import {
  PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE,
  PRICE_REPORT_EVENT_PRICE_DROPS_VALUE,
  PRICE_REPORT_EVENT_PRICE_RISES_VALUE,
} from "./ids";

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

export function parseMaxItemsInput(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.trim())) {
    return null;
  }

  const maxItems = Number(value.trim());

  return Number.isSafeInteger(maxItems) && maxItems >= 1 && maxItems <= MAX_PRICE_REPORT_ITEMS
    ? maxItems
    : null;
}

export function parseProductKeywordInput(value: unknown): string | null | undefined {
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

export function parseReportEvents(values: unknown[]): {
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
} | null {
  const validValues = new Set([
    PRICE_REPORT_EVENT_PRICE_DROPS_VALUE,
    PRICE_REPORT_EVENT_PRICE_RISES_VALUE,
    PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE,
  ]);

  if (
    values.length === 0 ||
    values.some((value) => typeof value !== "string" || !validValues.has(value))
  ) {
    return null;
  }

  return {
    includePriceDrops: values.includes(PRICE_REPORT_EVENT_PRICE_DROPS_VALUE),
    includePriceRises: values.includes(PRICE_REPORT_EVENT_PRICE_RISES_VALUE),
    includeNewProducts: values.includes(PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE),
  };
}

export function parseTimeOfDay(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function normalizeProductKeywordInput(value: string): string {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((group) => group.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
}

function countProductKeywordGroups(keyword: string): number {
  return keyword.split(",").filter((group) => group.trim().length > 0).length;
}
