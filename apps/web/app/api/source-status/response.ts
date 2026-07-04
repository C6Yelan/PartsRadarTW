// apps/web/app/api/source-status/response.ts
import { COOLPC_SOURCE_NAME } from "@partsradar/shared";

import type { SourceStatusCategoryRecord } from "./data";

const SOURCE_STALE_THRESHOLD_MS = 60 * 60 * 1000;

export type SourceStatus = "ok" | "stale" | "unavailable";

interface SourceStatusCategoryResponseItem {
  igrp: number;
  displayName: string;
  sourceName: string;
  status: SourceStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}

export interface SourceStatusResponseBody {
  source: typeof COOLPC_SOURCE_NAME;
  status: SourceStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  categories: SourceStatusCategoryResponseItem[];
}

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

function resolveGlobalStatus(categories: SourceStatusCategoryResponseItem[]): SourceStatus {
  if (categories.length > 0 && categories.every((category) => category.status === "ok")) {
    return "ok";
  }

  if (categories.some((category) => category.status !== "unavailable")) {
    return "stale";
  }

  return "unavailable";
}

function latestDate(values: Array<Date | null>): Date | null {
  const dates = values.filter((value): value is Date => value !== null);

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

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
