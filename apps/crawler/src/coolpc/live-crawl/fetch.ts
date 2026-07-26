// apps/crawler/src/coolpc/live-crawl/fetch.ts
// 提供 CoolPC live crawl 的基礎抓取能力：固定 UA 與 timeout、回應大小保護、錯誤格式化與重試判斷。

import type { CoolpcCategorySnapshotInput } from "../category-snapshot";
import { decodeCoolpcHtml } from "../parser";
import {
  assertCoolpcHtmlContentType,
  CoolpcSourceFetchError,
  fetchCoolpcSource,
} from "../source-fetch";

/**
 * CoolPC live crawl 抓取契約
 * 1) 回傳值為 CoolpcCategorySnapshotInput：
 *    - url / fetchedAt：本次抓取識別資訊
 *    - httpStatus：成功連線時為 HTTP 狀態碼；若請求失敗或中斷則為 null
 *    - rawHtml：成功讀取 body 且未發生可中斷例外時為 decode 後 HTML；否則為 null
 *    - fetchError：null 表示可繼續流程；非 null 包含失敗原因
 * 2) fetchError 可能包含：
 *    - "HTTP <status>"：HTTP 非 2xx
 *    - 例外格式化內容（timeout、DNS、TLS、連線中斷、body 超過上限等）
 * 3) 重試規則：
 *    - 先以 retryDelaysMs 決定最大嘗試次數
 *    - 預設只要非「body 超過上限」都會重試；命中上限即直接回傳錯誤
 *    - 超過最大重試時才會進入不可達邏輯（理論上不應到達）
 * 4) safety 邊界：
 *    - 固定最大 response 大小，避免單筆抓取拖垮流程記憶體
 */

// 限制單次抓取可接受的最大 response bytes，避免異常大頁面拖累整輪抓取流程。
export const MAX_COOLPC_RESPONSE_BODY_BYTES = 5 * 1024 * 1024;

const DEFAULT_COOLPC_FETCH_RETRY_DELAYS_MS = [3000] as const;

interface CoolpcFetchRetryOptions {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

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
      const response = await fetchCoolpcSource(url, {
        kind: "category-html",
        fetchImpl,
        requestInit: {
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
            "user-agent": userAgent,
          },
          signal: AbortSignal.timeout(timeoutMs),
        },
      });
      if (response.ok) {
        assertCoolpcHtmlContentType(response);
      }
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

export function formatCoolpcFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "name=Error message=CoolPC request failed";
  }

  const safeName = /^[A-Za-z][A-Za-z0-9]*$/.test(error.name) ? error.name : "Error";
  const safeMessage =
    error instanceof CoolpcSourceFetchError ||
    error.message.startsWith("CoolPC response body exceeds ")
      ? error.message
      : "CoolPC request failed";
  const parts = [`name=${safeName}`, `message=${safeMessage}`];
  const cause = error.cause;

  if (isRecord(cause)) {
    const nestedCause = isRecord(cause.cause) ? cause.cause : null;
    const code = cause.code ?? nestedCause?.code;

    if (
      (typeof code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(code)) ||
      typeof code === "number"
    ) {
      parts.push(`cause.code=${String(code)}`);
    }
  }

  return parts.join(" ").slice(0, 512);
}

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

function isRetryableCoolpcFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  if (error instanceof CoolpcSourceFetchError) {
    return error.kind === "network";
  }

  return !error.message.startsWith("CoolPC response body exceeds ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
