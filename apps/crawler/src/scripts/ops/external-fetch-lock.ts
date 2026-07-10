// apps/crawler/src/scripts/ops/external-fetch-lock.ts
// 提供外部來源抓取的檔案系統互斥鎖，避免多個 crawler process 同時打來源站。

import { type FilesystemLockHandle, tryAcquireFilesystemLock } from "../../shared/filesystem-lock";

export const DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS = 12 * 60 * 60;

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
