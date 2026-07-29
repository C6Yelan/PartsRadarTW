// apps/web/app/_shared/api-client.ts
// 提供 web client 共用的 public API error code parsing、429 判斷與固定使用者文案。

export const API_RATE_LIMITED_MESSAGE = "瀏覽速度較快，請稍後再試。";

export type PublicApiErrorCode =
  | "invalid_query"
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "temporarily_unavailable"
  | "internal_error";

const PUBLIC_API_ERROR_CODES = new Set<PublicApiErrorCode>([
  "invalid_query",
  "invalid_request",
  "not_found",
  "rate_limited",
  "temporarily_unavailable",
  "internal_error",
]);

export class ApiRequestError extends Error {
  constructor(
    fallbackMessage: string,
    public readonly status: number,
    public readonly code: PublicApiErrorCode | null,
  ) {
    super(fallbackMessage);
  }
}

export async function toApiRequestError(
  response: Response,
  fallbackMessage: string,
): Promise<ApiRequestError> {
  let code: PublicApiErrorCode | null = null;

  try {
    const body = (await response.json()) as unknown;
    code = readPublicApiErrorCode(body);
  } catch {
    code = null;
  }

  return new ApiRequestError(fallbackMessage, response.status, code);
}

export function isRateLimitedApiError(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && (error.status === 429 || error.code === "rate_limited")
  );
}

function readPublicApiErrorCode(value: unknown): PublicApiErrorCode | null {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return null;
  }

  const error = value.error;

  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  return typeof error.code === "string" &&
    PUBLIC_API_ERROR_CODES.has(error.code as PublicApiErrorCode)
    ? (error.code as PublicApiErrorCode)
    : null;
}
