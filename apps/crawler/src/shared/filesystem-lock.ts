// apps/crawler/src/shared/filesystem-lock.ts
// 提供單機程序共用的原子目錄鎖 primitive；各 feature 仍負責決定 lock path、owner 與 stale policy。

import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface FilesystemLockMetadata {
  owner: string;
  token: string;
  pid: number;
  acquiredAt: string;
}

export interface FilesystemLockHandle {
  readonly lockDir: string;
  readonly owner: string;
  release(): Promise<void>;
}

export interface TryAcquireFilesystemLockOptions {
  lockDir: string;
  owner: string;
  staleSeconds: number;
  now?: () => Date;
}

const LOCK_METADATA_FILE = "lock.json";
const STATE_GUARD_SUFFIX = ".state-guard";
const STATE_GUARD_RETRY_COUNT = 1000;
const STATE_GUARD_RETRY_DELAY_MS = 1;

// 以 mkdir 的原子性取得鎖；fresh lock contention 回傳 null，stale lock 最多清除後重試一次。
export async function tryAcquireFilesystemLock({
  lockDir,
  owner,
  staleSeconds,
  now = () => new Date(),
}: TryAcquireFilesystemLockOptions): Promise<FilesystemLockHandle | null> {
  if (!Number.isFinite(staleSeconds) || staleSeconds <= 0) {
    throw new Error("Filesystem lock staleSeconds must be greater than zero.");
  }

  const token = randomUUID();
  const acquiredAt = now();

  await mkdir(dirname(lockDir), { recursive: true });
  const stateGuard = await acquireStateGuard(lockDir);

  try {
    while (true) {
      try {
        await mkdir(lockDir);
        break;
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
          throw error;
        }

        const existingLock = await readExistingLock(lockDir);

        if (existingLock === null) {
          continue;
        }

        if (!isStaleLock(existingLock.acquiredAt, staleSeconds, acquiredAt)) {
          return null;
        }

        await rm(lockDir, { recursive: true });
      }
    }

    const metadata: FilesystemLockMetadata = {
      owner,
      token,
      pid: process.pid,
      acquiredAt: acquiredAt.toISOString(),
    };

    try {
      await writeFile(getMetadataPath(lockDir), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    } catch (error) {
      await rm(lockDir, { recursive: true, force: true });
      throw error;
    }
  } finally {
    await stateGuard.release();
  }

  return {
    lockDir,
    owner,
    async release() {
      const releaseGuard = await acquireStateGuard(lockDir);

      try {
        const currentMetadata = await readLockMetadata(lockDir);

        if (currentMetadata?.token !== token) {
          return;
        }

        await rm(lockDir, { recursive: true, force: true });
      } finally {
        await releaseGuard.release();
      }
    },
  };
}

// stale reclaim 與 token-safe release 都先取得短生命週期 guard，避免 check/remove/recreate 互相穿插。
async function acquireStateGuard(lockDir: string): Promise<{ release(): Promise<void> }> {
  const guardDir = `${lockDir}${STATE_GUARD_SUFFIX}`;

  for (let attempt = 0; attempt < STATE_GUARD_RETRY_COUNT; attempt += 1) {
    try {
      await mkdir(guardDir);

      return {
        async release() {
          await rm(guardDir, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }

      const stats = await readExpectedDirectory(guardDir, "Filesystem lock state guard");

      if (stats === null) {
        continue;
      }

      await delay(STATE_GUARD_RETRY_DELAY_MS);
    }
  }

  throw new Error(`Filesystem lock state guard remained busy: ${guardDir}`);
}

// 缺少或損壞 metadata 時改用 lock directory mtime，避免剛 mkdir、尚未寫 metadata 的鎖被立即搶走。
async function readExistingLock(lockDir: string): Promise<{ acquiredAt: string } | null> {
  const stats = await readExpectedDirectory(lockDir, "Filesystem lock path");

  if (stats === null) {
    return null;
  }

  const metadata = await readLockMetadata(lockDir);

  return {
    acquiredAt: metadata?.acquiredAt ?? stats.mtime.toISOString(),
  };
}

async function readExpectedDirectory(path: string, label: string): Promise<Stats | null> {
  let stats: Stats;

  try {
    stats = await lstat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a directory: ${path}`);
  }

  return stats;
}

// 只接受完整 lock metadata；缺檔、壞 JSON 或欄位不完整交由 directory mtime 判斷 stale。
async function readLockMetadata(lockDir: string): Promise<FilesystemLockMetadata | null> {
  try {
    const raw = await readFile(getMetadataPath(lockDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<FilesystemLockMetadata>;

    if (
      typeof parsed.owner === "string" &&
      typeof parsed.token === "string" &&
      typeof parsed.pid === "number" &&
      typeof parsed.acquiredAt === "string" &&
      Number.isFinite(Date.parse(parsed.acquiredAt))
    ) {
      return parsed as FilesystemLockMetadata;
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

function isStaleLock(acquiredAt: string, staleSeconds: number, now: Date): boolean {
  const acquiredTime = Date.parse(acquiredAt);

  if (!Number.isFinite(acquiredTime)) {
    return true;
  }

  return now.getTime() - acquiredTime >= staleSeconds * 1000;
}

function getMetadataPath(lockDir: string): string {
  return join(lockDir, LOCK_METADATA_FILE);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
