// apps/crawler/src/scripts/ops/external-fetch-lock.ts
// 提供外部來源抓取的檔案系統互斥鎖，避免多個 crawler process 同時打來源站。

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS = 12 * 60 * 60;

interface ExternalFetchLockMetadata {
  owner: string;
  token: string;
  pid: number;
  acquiredAt: string;
}

export interface ExternalFetchLockHandle {
  readonly lockDir: string;
  readonly owner: string;
  release(): Promise<void>;
}

interface AcquireExternalFetchLockOptions {
  lockDir: string;
  owner: string;
  staleSeconds?: number;
  now?: () => Date;
}

const LOCK_METADATA_FILE = "lock.json";

// 嘗試取得外部抓取鎖；若既有鎖未過期則回 null，過期鎖會被清除後重試一次。
export async function tryAcquireExternalFetchLock({
  lockDir,
  owner,
  staleSeconds = DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  now = () => new Date(),
}: AcquireExternalFetchLockOptions): Promise<ExternalFetchLockHandle | null> {
  const token = randomUUID();
  const acquiredAt = now();

  await mkdir(dirname(lockDir), { recursive: true });

  try {
    await mkdir(lockDir);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "EEXIST") {
      throw error;
    }

    const existingMetadata = await readLockMetadata(lockDir);

    if (!isStaleLock(existingMetadata?.acquiredAt ?? null, staleSeconds, acquiredAt)) {
      return null;
    }

    await rm(lockDir, { recursive: true, force: true });

    try {
      await mkdir(lockDir);
    } catch (retryError) {
      if (isNodeError(retryError) && retryError.code === "EEXIST") {
        return null;
      }

      throw retryError;
    }
  }

  const metadata: ExternalFetchLockMetadata = {
    owner,
    token,
    pid: process.pid,
    acquiredAt: acquiredAt.toISOString(),
  };

  await writeFile(getMetadataPath(lockDir), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    lockDir,
    owner,
    async release() {
      const currentMetadata = await readLockMetadata(lockDir);

      if (currentMetadata?.token !== token) {
        return;
      }

      await rm(lockDir, { recursive: true, force: true });
    },
  };
}

// 讀取 lock metadata；缺檔、壞 JSON 或欄位不完整都視為沒有可用 metadata。
async function readLockMetadata(lockDir: string): Promise<ExternalFetchLockMetadata | null> {
  try {
    const raw = await readFile(getMetadataPath(lockDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<ExternalFetchLockMetadata>;

    if (
      typeof parsed.owner === "string" &&
      typeof parsed.token === "string" &&
      typeof parsed.pid === "number" &&
      typeof parsed.acquiredAt === "string"
    ) {
      return parsed as ExternalFetchLockMetadata;
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }

  return null;
}

// 用 ISO 時間與 TTL 判斷 lock 是否過期；缺失或無效時間視為過期。
function isStaleLock(acquiredAt: string | null, staleSeconds: number, now: Date): boolean {
  if (!acquiredAt) {
    return true;
  }

  const acquiredTime = Date.parse(acquiredAt);

  if (!Number.isFinite(acquiredTime)) {
    return true;
  }

  return now.getTime() - acquiredTime >= staleSeconds * 1000;
}

// lock metadata 固定放在 lock 目錄內，讓目錄存在本身可作為互斥狀態。
function getMetadataPath(lockDir: string): string {
  return `${lockDir}/${LOCK_METADATA_FILE}`;
}

// 區分 Node.js 檔案系統錯誤，讓 ENOENT / EEXIST 可被 lock 流程安全處理。
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
