// apps/crawler/src/coolpc/live-crawl/fetch.ts
// 提供 CoolPC live crawl 的基礎抓取能力：固定 UA 與 timeout、回應大小保護、錯誤格式化與重試判斷。

import type { CoolpcCategorySnapshotInput } from "../category-snapshot";
import { decodeCoolpcHtml } from "../parser";

// 限制單次抓取可接受的最大 response bytes，避免異常大頁面拖累整輪抓取流程。
export const MAX_COOLPC_RESPONSE_BODY_BYTES = 5 * 1024 * 1024;

const DEFAULT_COOLPC_FETCH_RETRY_DELAYS_MS = [3000] as const;

interface CoolpcFetchRetryOptions {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

// 讀取 HTTP response body 時以 stream 逐塊累加，並限制最大位元組數以避免 memory 溢位。
export async function readResponseBodyWithLimit(
  response: Response,
  maxBytes = MAX_COOLPC_RESPONSE_BODY_BYTES,
): Promise<Uint8Array> {
  const contentLength = parseContentLength(response.headers.get("content-length"));

  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error(`CoolPC response body exceeds ${maxBytes} bytes.`);
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      await cancelReader(reader);
      throw new Error(`CoolPC response body exceeds ${maxBytes} bytes.`);
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

// 以固定 header 發送 live request，保留 retry 與 timeout 行為；成功回傳 raw html，失敗則回傳 fetchError。
export async function fetchLiveCategorySnapshot(
  igrp: number,
  fetchedAt: Date,
  url: string,
  userAgent: string,
  timeoutMs: number,
  log: ((message: string) => void) | undefined,
  retryOptions: CoolpcFetchRetryOptions = {},
): Promise<CoolpcCategorySnapshotInput> {
  log?.(`Fetching IGrp=${igrp}: ${url}`);
  const fetchImpl = retryOptions.fetchImpl ?? fetch;
  const retryDelaysMs = retryOptions.retryDelaysMs ?? DEFAULT_COOLPC_FETCH_RETRY_DELAYS_MS;
  const sleep = retryOptions.sleep ?? delay;
  const maxAttempts = retryDelaysMs.length + 1;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
          "user-agent": userAgent,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const bytes = await readResponseBodyWithLimit(response);
      const rawHtml = decodeCoolpcHtml(bytes);

      return {
        url,
        fetchedAt,
        httpStatus: response.status,
        rawHtml,
        fetchError: response.ok ? null : `HTTP ${response.status}`,
      };
    } catch (error) {
      const retryDelayMs = retryDelaysMs[attemptIndex];

      if (retryDelayMs !== undefined && isRetryableCoolpcFetchError(error)) {
        log?.(
          `Fetching IGrp=${igrp} failed. attempt=${attemptIndex + 1}/${maxAttempts} retryInMs=${retryDelayMs} error=${formatCoolpcFetchError(error)}`,
        );
        await sleep(retryDelayMs);
        continue;
      }

      return {
        url,
        fetchedAt,
        httpStatus: null,
        rawHtml: null,
        fetchError: formatCoolpcFetchError(error),
      };
    }
  }

  throw new Error("Unreachable CoolPC fetch retry state.");
}

// 格式化 fetch 錯誤為可持久化訊息，保留 name / message / cause，便於後續排障與對帳。
export function formatCoolpcFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const parts = [`name=${error.name || "Error"}`, `message=${error.message || "(empty)"}`];
  const cause = error.cause;

  if (isRecord(cause)) {
    const code = cause.code;
    const message = cause.message;

    if (typeof code === "string" || typeof code === "number") {
      parts.push(`cause.code=${String(code)}`);
    }

    if (typeof message === "string" && message.length > 0) {
      parts.push(`cause.message=${message}`);
    }
  }

  return parts.join(" ");
}

// 只解析合法且完整的 `content-length`，否則回傳 null 讓後續以實際 stream 大小保護。
function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || String(parsed) !== value.trim() || parsed < 0) {
    return null;
  }

  return parsed;
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // 取消 reader 失敗可忽略，呼叫端已掌握抓取失敗結果，僅做資源回收最小化。
  }
}

// 區分可重試與不可重試錯誤；大小限制錯誤屬於輸入端上限問題，不再重試。
function isRetryableCoolpcFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !error.message.startsWith("CoolPC response body exceeds ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 預設 sleep 實作，保留可測試替換（例如 fake timer 或快速延遲）。
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
