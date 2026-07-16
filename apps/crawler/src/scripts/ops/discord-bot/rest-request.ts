// apps/crawler/src/scripts/ops/discord-bot/rest-request.ts
// 封裝 Discord REST API 請求，統一處理 bot token、rate limit、JSON 解析與安全錯誤分類。

import type { DiscordRestOptions, DiscordRestResult } from "./types";

const DISCORD_REST_TIMEOUT_MS = 15_000;
const DISCORD_RESPONSE_MAX_BYTES = 256 * 1024;

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
      redirect: "error",
      signal: AbortSignal.timeout(DISCORD_REST_TIMEOUT_MS),
    });

    if (response.status === 429) {
      const rateLimitBody = await readDiscordJson<{
        code?: unknown;
        retry_after?: unknown;
        global?: unknown;
      }>(response);
      const retryAfterMs =
        parseRetryAfterHeader(response.headers) ?? resolveRetryAfterMsFromBody(rateLimitBody);

      return {
        status: "rate_limited",
        httpStatus: 429,
        errorCategory: "RATE_LIMITED",
        providerErrorCode: parseDiscordErrorCode(rateLimitBody),
        retryAfterMs,
        global: rateLimitBody?.global === true,
      };
    }

    if (!response.ok) {
      const errorBody = await readDiscordJson<Record<string, unknown>>(response);
      const providerErrorCode = parseDiscordErrorCode(errorBody);

      return {
        status: "failed",
        httpStatus: response.status,
        errorCategory: classifyDiscordDeliveryFailure(response.status, providerErrorCode),
        providerErrorCode,
        retryAfterMs: parseRetryAfterHeader(response.headers),
      };
    }

    return {
      status: "ok",
      httpStatus: response.status,
      body: await readDiscordJson<T>(response),
    };
  } catch {
    return {
      status: "failed",
      httpStatus: null,
      errorCategory: "TRANSPORT",
      providerErrorCode: null,
    };
  }
}

// Discord 成功或錯誤回應都可能沒有 body；解析失敗時交由上層以狀態碼判斷。
async function readDiscordJson<T>(response: Response): Promise<T | null> {
  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      receivedBytes += value.byteLength;

      if (receivedBytes > DISCORD_RESPONSE_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Discord response exceeded the byte limit.");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const text = Buffer.concat(chunks, receivedBytes).toString("utf8");

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
  const retryAfterSeconds = typeof body?.retry_after === "number" ? body.retry_after : null;

  return retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)
    ? Math.ceil(retryAfterSeconds * 1000)
    : 0;
}

// 優先讀取 Discord 回應 header 的 retry-after，單位同樣轉為毫秒。
function parseRetryAfterHeader(headers: Headers): number | undefined {
  const retryAfterSecondsText = headers.get("retry-after");

  if (!retryAfterSecondsText) {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfterSecondsText);

  return Number.isFinite(retryAfterSeconds) ? Math.ceil(retryAfterSeconds * 1000) : undefined;
}

// 組合 Discord API base URL 與 endpoint path，避免 base URL 尾端斜線造成重複。
function createDiscordApiUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
}

// Discord provider code 只接受 PostgreSQL Int 可安全保存的非負整數；其他 body 欄位全部捨棄。
function parseDiscordErrorCode(body: { code?: unknown } | null): number | null {
  const code =
    typeof body?.code === "number"
      ? body.code
      : typeof body?.code === "string" && /^\d{1,10}$/.test(body.code)
        ? Number(body.code)
        : null;

  return code !== null && Number.isSafeInteger(code) && code >= 0 && code <= 2_147_483_647
    ? code
    : null;
}

// 只依 HTTP status 與數字 provider code 分類，不從 provider message / errors 反向猜測。
function classifyDiscordDeliveryFailure(
  httpStatus: number,
  providerErrorCode: number | null,
): "DM_UNAVAILABLE" | "INTERACTION_EXPIRED" | "PERMISSIONS" | "PROVIDER" {
  if (providerErrorCode === 50007) {
    return "DM_UNAVAILABLE";
  }

  if (providerErrorCode === 10062) {
    return "INTERACTION_EXPIRED";
  }

  if (providerErrorCode === 50001 || providerErrorCode === 50013 || httpStatus === 403) {
    return "PERMISSIONS";
  }

  return "PROVIDER";
}
