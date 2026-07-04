// apps/crawler/src/coolpc/live-crawl/fetch.ts

import type { CoolpcCategorySnapshotInput } from "../category-snapshot";
import { decodeCoolpcHtml } from "../parser";

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
    // Best effort only; the caller already has the bounded failure state.
  }
}

function isRetryableCoolpcFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !error.message.startsWith("CoolPC response body exceeds ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
