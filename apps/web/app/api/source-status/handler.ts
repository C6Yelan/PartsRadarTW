import { COOLPC_SOURCE_NAME } from "@partsradar/shared";
import { internalErrorResponse, jsonOk } from "../_shared/responses";
const SOURCE_STALE_THRESHOLD_MS = 60 * 60 * 1000;

export type SourceStatus = "ok" | "stale" | "unavailable";

export interface SourceStatusCategoryRecord {
  igrp: number;
  displayName: string;
  sourceName: string;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  products: { id: string }[];
}

interface SourceStatusFindManyArgs {
  where: {
    enabled: true;
  };
  orderBy: {
    igrp: "asc";
  };
  select: {
    igrp: true;
    displayName: true;
    sourceName: true;
    lastCheckedAt: true;
    lastSuccessAt: true;
    products: {
      where: {
        isActive: true;
        currentPrice: {
          isNot: null;
        };
      };
      select: {
        id: true;
      };
      take: 1;
    };
  };
}

export const SOURCE_STATUS_CATEGORY_QUERY = {
  where: { enabled: true },
  orderBy: { igrp: "asc" },
  select: {
    igrp: true,
    displayName: true,
    sourceName: true,
    lastCheckedAt: true,
    lastSuccessAt: true,
    products: {
      where: {
        isActive: true,
        currentPrice: {
          isNot: null,
        },
      },
      select: {
        id: true,
      },
      take: 1,
    },
  },
} as const satisfies SourceStatusFindManyArgs;

export interface SourceStatusReadClient {
  sourceCategory: {
    findMany(args: SourceStatusFindManyArgs): Promise<SourceStatusCategoryRecord[]>;
  };
}

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

interface GetSourceStatusHandlerOptions {
  now?: () => Date;
}

export function createGetSourceStatusHandler(
  client: SourceStatusReadClient,
  options: GetSourceStatusHandlerOptions = {},
): () => Promise<Response> {
  return async () => {
    try {
      const now = options.now?.() ?? new Date();
      const categories = await client.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY);

      return jsonOk<SourceStatusResponseBody>(buildSourceStatusResponse(categories, now));
    } catch {
      return internalErrorResponse();
    }
  };
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
