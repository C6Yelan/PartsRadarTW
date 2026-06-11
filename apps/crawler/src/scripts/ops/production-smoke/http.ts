// apps/crawler/src/scripts/ops/production-smoke/http.ts

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type {
  CategoriesResponse,
  PriceHistoryResponse,
  ProductDetailResponse,
  ProductionSmokeOptions,
  ProductsResponse,
  RateLimitHeaderSnapshot,
  SourceStatusResponse,
} from "./types";

export async function fetchText(
  path: string,
  options: ProductionSmokeOptions,
): Promise<
  | {
      ok: true;
      status: number;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const response = await fetchWithTimeout(path, options);

  if (!response.ok) {
    return response;
  }

  return {
    ok: true,
    status: response.response.status,
  };
}

export async function fetchJson(
  path: string,
  options: ProductionSmokeOptions,
): Promise<
  | {
      ok: true;
      body: unknown;
      headers: Headers;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const response = await fetchWithTimeout(path, options);

  if (!response.ok) {
    return response;
  }

  try {
    return {
      ok: true,
      body: await response.response.json(),
      headers: response.response.headers,
    };
  } catch (error) {
    return {
      ok: false,
      message: `JSON parse failed: ${toSafeCliErrorMessage(error)}`,
    };
  }
}

export function readRateLimitHeaders(headers: Headers): RateLimitHeaderSnapshot | null {
  const clientSource = headers.get("X-RateLimit-Client-Source");
  const limit = parseNonNegativeHeaderInteger(headers.get("X-RateLimit-Limit"));
  const remaining = parseNonNegativeHeaderInteger(headers.get("X-RateLimit-Remaining"));
  const reset = parseNonNegativeHeaderInteger(headers.get("X-RateLimit-Reset"));

  if (
    !clientSource ||
    !["cf", "xff", "unknown"].includes(clientSource) ||
    limit === null ||
    limit <= 0 ||
    remaining === null ||
    reset === null ||
    reset <= 0
  ) {
    return null;
  }

  return {
    clientSource,
    limit,
    remaining,
    reset,
  };
}

function parseNonNegativeHeaderInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

export function isPublicHttpsUrl(value: string): boolean {
  const url = new URL(value);

  return (
    url.protocol === "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "::1"
  );
}

export async function fetchWithTimeout(
  path: string,
  options: ProductionSmokeOptions,
): Promise<
  | {
      ok: true;
      response: Response;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const url = new URL(path, options.baseUrl);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "PartsRadarTW production smoke (+https://github.com/C6Yelan/PartsRadarTW)",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      response,
    };
  } catch (error) {
    return {
      ok: false,
      message: toSafeCliErrorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function isSourceStatusResponse(value: unknown): value is SourceStatusResponse {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    (typeof value.lastSuccessAt === "string" || value.lastSuccessAt === null)
  );
}

export function isProductsResponse(value: unknown): value is ProductsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    isRecord(value.pagination) &&
    typeof value.pagination.totalItems === "number"
  );
}

export function isCategoriesResponse(value: unknown): value is CategoriesResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every((category) => isRecord(category) && typeof category.igrp === "number")
  );
}

export function isProductDetailResponse(value: unknown): value is ProductDetailResponse {
  return isRecord(value) && typeof value.id === "string";
}

export function isPriceHistoryResponse(value: unknown): value is PriceHistoryResponse {
  return isRecord(value) && Array.isArray(value.points);
}

export function isV2PriceMovement(value: unknown): value is {
  rangeDays: 30;
  deltaAmount: number | null;
  deltaPercent: number | null;
} {
  return (
    isRecord(value) &&
    value.rangeDays === 30 &&
    (typeof value.deltaAmount === "number" || value.deltaAmount === null) &&
    (typeof value.deltaPercent === "number" || value.deltaPercent === null)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
