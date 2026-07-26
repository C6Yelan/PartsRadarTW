// 低頻抓取 CoolPC 估價頁篩選，驗證通過後發布成 scheduled crawler 可套用的本地 state。

import { createHash } from "node:crypto";
import { parseCoolpcFilterSnapshot } from "./filter-sync/parser";
import {
  COOLPC_FILTER_SYNC_STATE_VERSION,
  type CoolpcFilterSyncState,
  readCoolpcFilterSyncState,
  writeCoolpcFilterSyncState,
} from "./filter-sync/state";
import { readResponseBodyWithLimit } from "./live-crawl/fetch";
import { decodeCoolpcHtml } from "./parser";
import { assertCoolpcHtmlContentType, fetchCoolpcSource } from "./source-fetch";

const COOLPC_FILTER_SOURCE_URL = "https://www.coolpc.com.tw/evaluate.php";
export const DEFAULT_FILTER_SYNC_INTERVAL_SECONDS = 7 * 24 * 60 * 60;
const FILTER_SYNC_FAILURE_RETRY_SECONDS = 6 * 60 * 60;
const MIN_TAGGED_PRODUCT_RATIO = 0.5;

export interface RefreshCoolpcFilterSyncOptions {
  stateFilePath: string;
  intervalSeconds: number;
  timeoutMs: number;
  userAgent: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface RefreshCoolpcFilterSyncResult {
  outcome: "skipped" | "published" | "failed";
  state: CoolpcFilterSyncState | null;
}

export interface FilterSyncJoinCoverageFailure {
  igrp: number;
  matchedCount: number;
  totalCount: number;
}

export async function refreshCoolpcFilterSync(
  options: RefreshCoolpcFilterSyncOptions,
): Promise<RefreshCoolpcFilterSyncResult> {
  const now = options.now ?? new Date();
  let previousState: CoolpcFilterSyncState | null = null;

  try {
    previousState = await readCoolpcFilterSyncState(options.stateFilePath);
  } catch {
    previousState = null;
  }

  if (!isFilterSyncDue(previousState, now, options.intervalSeconds)) {
    return { outcome: "skipped", state: previousState };
  }

  try {
    const html = await fetchFilterSource(options);
    const snapshot = parseCoolpcFilterSnapshot(html);
    validateSnapshotCoverage(snapshot, previousState);
    const state: CoolpcFilterSyncState = {
      version: COOLPC_FILTER_SYNC_STATE_VERSION,
      lastAttemptAt: now.toISOString(),
      lastSuccessAt: now.toISOString(),
      lastError: null,
      sourceHash: hashSnapshot(snapshot.tagsByIgrp),
      conditionCount: snapshot.conditionCount,
      productCount: snapshot.productCount,
      taggedProductCount: snapshot.taggedProductCount,
      ambiguousProductCount: snapshot.ambiguousProductCount,
      tagsByIgrp: snapshot.tagsByIgrp,
      refreshRequestedAt: null,
      joinCoverageFailures: {},
    };
    await writeCoolpcFilterSyncState(options.stateFilePath, state);
    return { outcome: "published", state };
  } catch (error) {
    const state: CoolpcFilterSyncState = {
      version: COOLPC_FILTER_SYNC_STATE_VERSION,
      lastAttemptAt: now.toISOString(),
      lastSuccessAt: previousState?.lastSuccessAt ?? null,
      lastError: error instanceof Error ? error.message : String(error),
      sourceHash: previousState?.sourceHash ?? null,
      conditionCount: previousState?.conditionCount ?? 0,
      productCount: previousState?.productCount ?? 0,
      taggedProductCount: previousState?.taggedProductCount ?? 0,
      ambiguousProductCount: previousState?.ambiguousProductCount ?? 0,
      tagsByIgrp: previousState?.tagsByIgrp ?? {},
      refreshRequestedAt: previousState?.refreshRequestedAt ?? null,
      joinCoverageFailures: previousState?.joinCoverageFailures ?? {},
    };
    await writeCoolpcFilterSyncState(options.stateFilePath, state);
    return { outcome: "failed", state };
  }
}

function validateSnapshotCoverage(
  snapshot: ReturnType<typeof parseCoolpcFilterSnapshot>,
  previousState: CoolpcFilterSyncState | null,
): void {
  const taggedRatio = snapshot.taggedProductCount / snapshot.productCount;
  if (taggedRatio < MIN_TAGGED_PRODUCT_RATIO) {
    throw new Error(
      `CoolPC filter tag coverage is too low: ${snapshot.taggedProductCount}/${snapshot.productCount}.`,
    );
  }

  if (
    previousState &&
    previousState.productCount > 0 &&
    snapshot.productCount < previousState.productCount * MIN_TAGGED_PRODUCT_RATIO
  ) {
    throw new Error(
      `CoolPC filter product coverage dropped sharply: ${snapshot.productCount}/${previousState.productCount}.`,
    );
  }
}

export function isFilterSyncDue(
  state: CoolpcFilterSyncState | null,
  now: Date,
  intervalSeconds: number,
): boolean {
  if (!state) {
    return true;
  }

  if (state.refreshRequestedAt && !state.lastError) {
    return true;
  }

  const retrySeconds = state.lastError
    ? Math.min(intervalSeconds, FILTER_SYNC_FAILURE_RETRY_SECONDS)
    : intervalSeconds;
  return now.getTime() - Date.parse(state.lastAttemptAt) >= retrySeconds * 1000;
}

export async function markCoolpcFilterSyncJoinCoverageDegraded(
  stateFilePath: string,
  failures: readonly FilterSyncJoinCoverageFailure[],
  now = new Date(),
): Promise<CoolpcFilterSyncState | null> {
  if (failures.length === 0) {
    return readCoolpcFilterSyncState(stateFilePath);
  }

  const state = await readCoolpcFilterSyncState(stateFilePath);
  if (!state) {
    return null;
  }

  const detectedAt = now.toISOString();
  const joinCoverageFailures = { ...(state.joinCoverageFailures ?? {}) };
  for (const failure of failures) {
    const key = String(failure.igrp);
    joinCoverageFailures[key] = {
      matchedCount: failure.matchedCount,
      totalCount: failure.totalCount,
      firstDetectedAt: joinCoverageFailures[key]?.firstDetectedAt ?? detectedAt,
      lastDetectedAt: detectedAt,
    };
  }

  const degradedState: CoolpcFilterSyncState = {
    ...state,
    refreshRequestedAt: state.refreshRequestedAt ?? detectedAt,
    joinCoverageFailures,
  };
  await writeCoolpcFilterSyncState(stateFilePath, degradedState);
  return degradedState;
}

async function fetchFilterSource(options: RefreshCoolpcFilterSyncOptions): Promise<string> {
  const response = await fetchCoolpcSource(COOLPC_FILTER_SOURCE_URL, {
    kind: "filter-html",
    fetchImpl: options.fetchImpl,
    requestInit: {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
        "user-agent": options.userAgent,
      },
      signal: AbortSignal.timeout(options.timeoutMs),
    },
  });

  if (!response.ok) {
    throw new Error(`CoolPC filter source returned HTTP ${response.status}.`);
  }
  assertCoolpcHtmlContentType(response);

  return decodeCoolpcHtml(await readResponseBodyWithLimit(response));
}

function hashSnapshot(tagsByIgrp: CoolpcFilterSyncState["tagsByIgrp"]): string {
  return createHash("sha256").update(JSON.stringify(tagsByIgrp)).digest("hex");
}
