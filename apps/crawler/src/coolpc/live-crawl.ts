// apps/crawler/src/coolpc/live-crawl.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import { COOLPC_OFFICIAL_BASE_URL, isOfficialCoolpcBaseUrl } from "@partsradar/shared";
import {
  processCoolpcCategorySnapshotWithPrisma,
  type CoolpcCategorySnapshotInput,
} from "./category-snapshot";
import {
  CRAWL_TRIGGER_TYPES,
  runCoolpcCrawlOnceWithPrisma,
  type CrawlTriggerTypeValue,
  type RunCoolpcCrawlOnceResult,
} from "./crawl-run";
import { createCoolpcCategoryUrl, decodeCoolpcHtml } from "./parser";

export const DEFAULT_COOLPC_BASE_URL = COOLPC_OFFICIAL_BASE_URL;
export const DEFAULT_COOLPC_CATEGORY_DELAY_MS = 8000;
export const DEFAULT_COOLPC_FETCH_TIMEOUT_MS = 30000;
export const MAX_COOLPC_RESPONSE_BODY_BYTES = 5 * 1024 * 1024;

const DEFAULT_COOLPC_FETCH_RETRY_DELAYS_MS = [3000] as const;
const MIN_COOLPC_CATEGORY_DELAY_MS = 1000;
const MAX_COOLPC_CATEGORY_DELAY_MS = 60000;
const MIN_COOLPC_FETCH_TIMEOUT_MS = 5000;
const MAX_COOLPC_FETCH_TIMEOUT_MS = 60000;

export interface RunCoolpcCategoryCrawlOptions {
  client: PrismaClient;
  storageDir: string;
  triggerType?: CrawlTriggerTypeValue;
  fromRawDir?: string | null;
  delayMs?: number;
  fetchTimeoutMs?: number;
  baseUrl?: string;
  allowUnsafeBaseUrlForTesting?: boolean;
  fetchUserAgent: string;
  log?: (message: string) => void;
}

interface ValidateCoolpcBaseUrlOptions {
  allowUnsafeBaseUrlForTesting?: boolean;
  nodeEnv?: string;
}

interface ValidateRawReplayOptions {
  fromRawDir: string | null;
  triggerType: CrawlTriggerTypeValue;
  nodeEnv?: string;
}

interface CrawlTimingOptions {
  delayMs: number;
  fetchTimeoutMs: number;
}

interface CoolpcFetchRetryOptions {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

export async function runCoolpcCategoryCrawl({
  client,
  storageDir,
  triggerType = CRAWL_TRIGGER_TYPES.MANUAL,
  fromRawDir = null,
  delayMs = DEFAULT_COOLPC_CATEGORY_DELAY_MS,
  fetchTimeoutMs = DEFAULT_COOLPC_FETCH_TIMEOUT_MS,
  baseUrl,
  allowUnsafeBaseUrlForTesting = false,
  fetchUserAgent,
  log,
}: RunCoolpcCategoryCrawlOptions): Promise<RunCoolpcCrawlOnceResult> {
  let processedCategoryCount = 0;
  const timingOptions = validateCrawlTimingOptions({ delayMs, fetchTimeoutMs });
  const resolvedBaseUrl = validateCoolpcBaseUrl(baseUrl, {
    allowUnsafeBaseUrlForTesting,
  });

  validateRawReplayOptions({
    fromRawDir,
    triggerType,
  });

  return runCoolpcCrawlOnceWithPrisma({
    client,
    triggerType,
    processCategory: async ({ crawlRunId, category }) => {
      if (!fromRawDir && processedCategoryCount > 0) {
        await delay(timingOptions.delayMs);
      }

      processedCategoryCount += 1;

      const fetchedAt = new Date();
      const url = createCoolpcCategoryUrl(category.igrp, resolvedBaseUrl);
      const snapshot = fromRawDir
        ? await readRawCategorySnapshot(fromRawDir, category.igrp, fetchedAt, url, log)
        : await fetchLiveCategorySnapshot(
            category.igrp,
            fetchedAt,
            url,
            fetchUserAgent,
            timingOptions.fetchTimeoutMs,
            log,
          );

      return processCoolpcCategorySnapshotWithPrisma({
        client,
        storageDir,
        crawlRunId,
        category,
        snapshot,
      });
    },
  });
}

export async function assertSeededCategories(
  client: Pick<PrismaClient, "sourceCategory">,
): Promise<void> {
  const enabledCategoryCount = await client.sourceCategory.count({
    where: { enabled: true },
  });

  if (enabledCategoryCount === 0) {
    throw new Error("No enabled source categories found. Run `pnpm db:seed` before crawling.");
  }
}

export function validateCoolpcBaseUrl(
  baseUrl = DEFAULT_COOLPC_BASE_URL,
  options: ValidateCoolpcBaseUrlOptions = {},
): string {
  let url: URL;
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("CoolPC base URL must be a valid URL.");
  }

  if (isOfficialCoolpcBaseUrl(url)) {
    return DEFAULT_COOLPC_BASE_URL;
  }

  if (options.allowUnsafeBaseUrlForTesting && nodeEnv !== "production") {
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Test-only CoolPC base URL override must use HTTP or HTTPS.");
    }

    return url.origin;
  }

  throw new Error(`CoolPC base URL must be ${COOLPC_OFFICIAL_BASE_URL}.`);
}

export function validateRawReplayOptions({
  fromRawDir,
  triggerType,
  nodeEnv = process.env.NODE_ENV,
}: ValidateRawReplayOptions): void {
  if (!fromRawDir) {
    return;
  }

  if (triggerType === CRAWL_TRIGGER_TYPES.SCHEDULED) {
    throw new Error("Scheduled CoolPC crawler cannot use raw HTML replay.");
  }

  if (nodeEnv === "production") {
    throw new Error("Raw HTML replay is disabled in production crawler runtime.");
  }
}

export function validateCrawlTimingOptions({
  delayMs,
  fetchTimeoutMs,
}: CrawlTimingOptions): CrawlTimingOptions {
  return {
    delayMs: validateIntegerRange(
      "delayMs",
      delayMs,
      MIN_COOLPC_CATEGORY_DELAY_MS,
      MAX_COOLPC_CATEGORY_DELAY_MS,
    ),
    fetchTimeoutMs: validateIntegerRange(
      "fetchTimeoutMs",
      fetchTimeoutMs,
      MIN_COOLPC_FETCH_TIMEOUT_MS,
      MAX_COOLPC_FETCH_TIMEOUT_MS,
    ),
  };
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

async function readRawCategorySnapshot(
  rawDir: string,
  igrp: number,
  fetchedAt: Date,
  url: string,
  log: ((message: string) => void) | undefined,
): Promise<CoolpcCategorySnapshotInput> {
  const rawPath = join(rawDir, `igrp-${igrp}.html`);
  log?.(`Reading IGrp=${igrp} from ${rawPath}`);

  return {
    url,
    fetchedAt,
    httpStatus: 200,
    rawHtml: await readFile(rawPath, "utf8"),
  };
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateIntegerRange(label: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return value;
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

function isRetryableCoolpcFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !error.message.startsWith("CoolPC response body exceeds ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
