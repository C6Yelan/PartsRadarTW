// apps/crawler/src/scripts/ops/discord-bot/rest-request.ts
// 封裝 Discord REST API 請求，統一處理 bot token、rate limit、JSON 解析與安全錯誤摘要。

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { DiscordRestOptions, DiscordRestResult } from "./types";

// 發送單次 Discord REST 請求，回傳給上層分流的技術結果；使用者文案需再經過 formatter 泛化。
export async function sendDiscordRestRequest<T>({
  token,
  apiBaseUrl,
  fetchImpl = fetch,
  method,
  path,
  body,
}: DiscordRestOptions & {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
}): Promise<DiscordRestResult<T>> {
  try {
    const response = await fetchImpl(createDiscordApiUrl(apiBaseUrl, path), {
      method,
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
        "user-agent": "PartsRadarTW Discord bot (+https://github.com/C6Yelan/PartsRadarTW)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 429) {
      const rateLimitBody = await readDiscordJson<{
        retry_after?: unknown;
        global?: unknown;
      }>(response);
      const retryAfterMs =
        parseRetryAfterHeader(response.headers) ?? resolveRetryAfterMsFromBody(rateLimitBody);

      return {
        status: "rate_limited",
        httpStatus: 429,
        retryAfterMs,
        global: rateLimitBody?.global === true,
      };
    }

    if (!response.ok) {
      const errorBody = await readDiscordJson<unknown>(response);

      return {
        status: "failed",
        httpStatus: response.status,
        message: formatDiscordApiError(response.status, errorBody),
        retryAfterMs: parseRetryAfterHeader(response.headers),
      };
    }

    return {
      status: "ok",
      httpStatus: response.status,
      body: await readDiscordJson<T>(response),
    };
  } catch (error) {
    return {
      status: "failed",
      httpStatus: null,
      message: toSafeCliErrorMessage(error),
    };
  }
}

// Discord 成功或錯誤回應都可能沒有 body；解析失敗時交由上層以狀態碼判斷。
async function readDiscordJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Discord body 的 retry_after 使用秒，內部統一轉成毫秒方便排程與 sleep 使用。
function resolveRetryAfterMsFromBody(body: { retry_after?: unknown } | null): number {
  const retryAfter = typeof body?.retry_after === "number" ? body.retry_after : null;

  return retryAfter !== null && Number.isFinite(retryAfter) ? Math.ceil(retryAfter * 1000) : 0;
}

// 優先讀取 Discord 回應 header 的 retry-after，單位同樣轉為毫秒。
function parseRetryAfterHeader(headers: Headers): number | undefined {
  const retryAfter = headers.get("retry-after");

  if (!retryAfter) {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfter);

  return Number.isFinite(retryAfterSeconds) ? Math.ceil(retryAfterSeconds * 1000) : undefined;
}

// 組合 Discord API base URL 與 endpoint path，避免 base URL 尾端斜線造成重複。
function createDiscordApiUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
}

// 產生後台用 Discord API 錯誤摘要；不得直接顯示給使用者。
function formatDiscordApiError(httpStatus: number, body: unknown): string {
  const details = isRecord(body) ? body : null;
  const code =
    typeof details?.code === "string" || typeof details?.code === "number"
      ? ` code=${details.code}`
      : "";
  const message =
    typeof details?.message === "string" && details.message.trim()
      ? ` message=${details.message.trim()}`
      : "";
  const errors =
    details?.errors === undefined ? "" : ` errors=${serializeDiscordErrors(details.errors)}`;

  return `Discord API returned HTTP ${httpStatus}.${code}${message}${errors}`;
}

// 限制 Discord errors 摘要長度，避免過大的錯誤 payload 進入 log 或 DB。
function serializeDiscordErrors(errors: unknown): string {
  try {
    return JSON.stringify(errors).slice(0, 2_000);
  } catch {
    return "unserializable";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
