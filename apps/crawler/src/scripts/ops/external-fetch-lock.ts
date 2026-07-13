// apps/crawler/src/scripts/ops/external-fetch-lock.ts
// 提供外部來源抓取的檔案系統互斥鎖，避免多個 crawler process 同時打來源站。

import { type FilesystemLockHandle, tryAcquireFilesystemLock } from "../../shared/filesystem-lock";

export const DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS = 5 * 60;
const MIN_EXTERNAL_FETCH_LOCK_STALE_SECONDS = 60;
const MAX_EXTERNAL_FETCH_LOCK_STALE_SECONDS = 7 * 24 * 60 * 60;

export type ExternalFetchLockHandle = FilesystemLockHandle;

interface AcquireExternalFetchLockOptions {
  lockDir: string;
  owner: string;
  staleSeconds?: number;
  now?: () => Date;
}

// 嘗試取得外部抓取鎖；若既有鎖未過期則回 null，過期鎖會被清除後重試一次。
export async function tryAcquireExternalFetchLock({
  lockDir,
  owner,
  staleSeconds = DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  now = () => new Date(),
}: AcquireExternalFetchLockOptions): Promise<ExternalFetchLockHandle | null> {
  return tryAcquireFilesystemLock({
    lockDir,
    owner,
    staleSeconds,
    now,
  });
}

// 統一解析各 live-fetch 入口共用的 lock stale env，避免不同 CLI 使用不同安全範圍。
export function parseExternalFetchLockStaleSeconds(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isFinite(value) || String(value) !== raw.trim()) {
    throw new Error("EXTERNAL_FETCH_LOCK_STALE_SECONDS must be an integer.");
  }

  if (value < MIN_EXTERNAL_FETCH_LOCK_STALE_SECONDS) {
    throw new Error(
      `EXTERNAL_FETCH_LOCK_STALE_SECONDS must be at least ${MIN_EXTERNAL_FETCH_LOCK_STALE_SECONDS}.`,
    );
  }

  if (value > MAX_EXTERNAL_FETCH_LOCK_STALE_SECONDS) {
    throw new Error(
      `EXTERNAL_FETCH_LOCK_STALE_SECONDS must be at most ${MAX_EXTERNAL_FETCH_LOCK_STALE_SECONDS}.`,
    );
  }

  return value;
}
