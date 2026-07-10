// apps/crawler/src/scripts/ops/production-smoke/http.ts
// 提供 production smoke 公開 HTTP 檢查共用的 fetch、header 解析與 API response shape guard。

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type {
  SmokeCategoriesResponse,
  SmokePriceHistoryResponse,
  SmokeProductDetailResponse,
  ProductionSmokeOptions,
  SmokeProductsResponse,
  RateLimitHeaderSnapshot,
  SmokeSourceStatusResponse,
} from "./types";

// 取得文字型頁面或端點狀態，只回傳 HTTP 成功與否，不解析 response body。
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

// 取得 JSON API 回應，並把 HTTP / JSON 解析錯誤轉成 smoke check 可顯示的安全訊息。
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

// 讀取公開 API rate limit headers，確認 public smoke 能觀察到 client source 與配額資訊。
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

// 判斷 base URL 是否為公開 HTTPS 站點，用於要求更嚴格的 client source 可觀測性。
export function isPublicHttpsUrl(value: string): boolean {
  const url = new URL(value);

  return (
    url.protocol === "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "::1"
  );
}

// 以 production smoke timeout 發送 HTTP request，並統一包裝 HTTP 失敗與網路錯誤。
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

// 驗證 source-status API 的最小 response shape，避免 smoke 依賴完整 web 型別。
export function isSmokeSourceStatusResponse(value: unknown): value is SmokeSourceStatusResponse {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    (typeof value.lastSuccessAt === "string" || value.lastSuccessAt === null)
  );
}

// 驗證商品列表 API 的最小 response shape，供 public smoke 取得商品 id 與圖片抽樣。
export function isSmokeProductsResponse(value: unknown): value is SmokeProductsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    isRecord(value.pagination) &&
    typeof value.pagination.totalItems === "number"
  );
}

// 驗證分類 API 的最小 response shape，確認分類資料可供前端選單使用。
export function isSmokeCategoriesResponse(value: unknown): value is SmokeCategoriesResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(
      (category) => isRecord(category) && typeof category.slug === "string" && category.slug !== "",
    )
  );
}

// 驗證商品詳細 API 的最小 response shape，確認列表商品可被詳細頁 API 讀取。
export function isSmokeProductDetailResponse(value: unknown): value is SmokeProductDetailResponse {
  return isRecord(value) && typeof value.id === "string";
}

// 驗證價格歷史 API 的最小 response shape，確認價格圖表資料端點可讀取。
export function isSmokePriceHistoryResponse(value: unknown): value is SmokePriceHistoryResponse {
  return isRecord(value) && Array.isArray(value.points);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
