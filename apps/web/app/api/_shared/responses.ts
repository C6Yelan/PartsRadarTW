// apps/web/app/api/_shared/responses.ts
// 提供 web public API 共用 JSON response helper，集中維持成功格式與安全的泛用錯誤訊息。

export const API_ERROR_MESSAGES = {
  invalidQuery: "Invalid query parameter.",
  notFound: "Resource not found.",
  rateLimited: "Too many requests. Please try again later.",
  internalError: "Internal server error.",
} as const;

export type ApiErrorCode = "invalid_query" | "not_found" | "rate_limited" | "internal_error";

export interface ApiErrorResponseBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export interface RateLimitedResponseOptions {
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
  retryAfterSeconds: number;
}

// 建立成功 JSON response；body 維持各 API 自己的公開 contract，不額外包一層。
export function jsonOk<TBody>(body: TBody, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    status: init?.status ?? 200,
  });
}

function jsonError(
  status: 400 | 404 | 429 | 500,
  code: ApiErrorCode,
  message: string,
  init?: ResponseInit,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    } satisfies ApiErrorResponseBody,
    {
      ...init,
      status,
    },
  );
}

// 回應 query 驗證失敗；訊息固定泛用，避免暴露具體 parser 或資料查詢細節。
export function invalidQueryResponse(): Response {
  return jsonError(400, "invalid_query", API_ERROR_MESSAGES.invalidQuery);
}

// 回應找不到資源；不區分不存在、未啟用或不可公開等內部原因。
export function notFoundResponse(): Response {
  return jsonError(404, "not_found", API_ERROR_MESSAGES.notFound);
}

// 回應 API 限流；只公開 retry 與標準 rate limit headers，不回傳 client identifier。
export function rateLimitedResponse(options: RateLimitedResponseOptions): Response {
  return jsonError(429, "rate_limited", API_ERROR_MESSAGES.rateLimited, {
    headers: {
      "Retry-After": String(options.retryAfterSeconds),
      "X-RateLimit-Limit": String(options.limit),
      "X-RateLimit-Remaining": String(options.remaining),
      "X-RateLimit-Reset": String(options.resetEpochSeconds),
    },
  });
}

// 回應未預期錯誤；固定泛用訊息，避免 Prisma、DB、crawler 或 env 細節外洩。
export function internalErrorResponse(): Response {
  return jsonError(500, "internal_error", API_ERROR_MESSAGES.internalError);
}
