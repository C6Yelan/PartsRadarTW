// apps/crawler/src/shared/filesystem-lock.ts
// 提供單機程序共用的原子目錄鎖 primitive；各 feature 仍負責決定 lock path、owner 與 stale policy。

import { createHash, randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

interface FilesystemLockMetadata {
  owner: string;
  token: string;
  pid: number;
  acquiredAt: string;
}

interface StateGuardMetadata {
  token: string;
  pid: number;
  acquiredAt: string;
}

interface StateGuardObservation {
  acquiredAt: string;
  identity: string;
  metadata: StateGuardMetadata | null;
}

interface StateGuardHandle {
  assertOwned(): Promise<void>;
  release(): Promise<void>;
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
const STATE_GUARD_METADATA_FILE = "guard.json";
const RETIRED_STATE_GUARD_METADATA_FILE = "retired.json";
const STATE_GUARD_STALE_MS = 30_000;
const RETIRED_STATE_GUARD_GRACE_MS = STATE_GUARD_STALE_MS * 2;
const STATE_GUARD_RETRY_COUNT = 31_000;
const STATE_GUARD_RETRY_DELAY_MS = 1;
const lastRetiredStateGuardPruneAt = new Map<string, number>();

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
  if (await hasFreshExistingLock(lockDir, staleSeconds, acquiredAt)) {
    return null;
  }

  const stateGuard = await acquireStateGuard(lockDir, () =>
    hasFreshExistingLock(lockDir, staleSeconds, acquiredAt),
  );

  if (stateGuard === null) {
    return null;
  }

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

        await stateGuard.assertOwned();
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
      await stateGuard.assertOwned();
      await writeFile(getMetadataPath(lockDir), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    } catch (error) {
      try {
        await stateGuard.assertOwned();
        await rm(lockDir, { recursive: true, force: true });
      } catch {
        // 失去 guard ownership 時保留主鎖，交由既有 stale policy 復原。
      }
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

      if (releaseGuard === null) {
        throw new Error(`Filesystem lock state guard acquisition stopped unexpectedly: ${lockDir}`);
      }

      try {
        const currentMetadata = await readLockMetadata(lockDir);

        if (currentMetadata?.token !== token) {
          return;
        }

        await releaseGuard.assertOwned();
        await rm(lockDir, { recursive: true, force: true });
      } finally {
        await releaseGuard.release();
      }
    },
  };
}

// stale reclaim 與 token-safe release 都先取得短生命週期 guard，避免 check/remove/recreate 互相穿插。
async function acquireStateGuard(
  lockDir: string,
  shouldStopWaiting?: () => Promise<boolean>,
): Promise<StateGuardHandle | null> {
  const guardDir = `${lockDir}${STATE_GUARD_SUFFIX}`;
  const token = randomUUID();

  await maybePruneRetiredStateGuards(guardDir);

  for (let attempt = 0; attempt < STATE_GUARD_RETRY_COUNT; attempt += 1) {
    try {
      await mkdir(guardDir);

      const metadata: StateGuardMetadata = {
        token,
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      };

      // 寫入失敗時保留空 guard，由 stale recovery 先補共同 identity 再 retire。
      await writeFile(
        join(guardDir, STATE_GUARD_METADATA_FILE),
        `${JSON.stringify(metadata, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );

      await assertStateGuardOwned(guardDir, token);

      return {
        async assertOwned() {
          await assertStateGuardOwned(guardDir, token);
        },
        async release() {
          const observation = await readStateGuardObservation(guardDir);

          if (observation?.metadata?.token !== token) {
            return;
          }

          await retireStateGuard(guardDir, observation);
        },
      };
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }

      const observation = await readStateGuardObservation(guardDir);

      if (observation === null) {
        continue;
      }

      if (await retireOrphanedStateGuard(guardDir, observation)) {
        continue;
      }

      if (shouldStopWaiting && (await shouldStopWaiting())) {
        return null;
      }

      await delay(STATE_GUARD_RETRY_DELAY_MS);
    }
  }

  throw new Error(`Filesystem lock state guard remained busy: ${guardDir}`);
}

async function hasFreshExistingLock(
  lockDir: string,
  staleSeconds: number,
  now: Date,
): Promise<boolean> {
  const existingLock = await readExistingLock(lockDir);

  return (
    existingLock?.hasMetadata === true && !isStaleLock(existingLock.acquiredAt, staleSeconds, now)
  );
}

// Guard 僅包住數次本機檔案操作；超過門檻視為中斷遺留，以固定 retired path 原子移出。
async function retireOrphanedStateGuard(
  guardDir: string,
  observed: StateGuardObservation,
): Promise<boolean> {
  if (!isStateGuardStale(observed)) {
    return false;
  }

  let normalized = observed;

  if (normalized.metadata === null) {
    await initializeLegacyStateGuardMetadata(guardDir, normalized);
    const current = await readStateGuardObservation(guardDir);

    if (current === null) {
      return true;
    }

    normalized = current;
  }

  if (!isStateGuardStale(normalized)) {
    return false;
  }

  return retireStateGuard(guardDir, normalized);
}

// 舊版空 guard 先以 wx 建立共同 identity；只有第一個 contender 能寫入，後續都讀同一 token。
async function initializeLegacyStateGuardMetadata(
  guardDir: string,
  observed: StateGuardObservation,
): Promise<void> {
  const metadata: StateGuardMetadata = {
    token: randomUUID(),
    pid: 0,
    acquiredAt: observed.acquiredAt,
  };

  try {
    await writeFile(
      join(guardDir, STATE_GUARD_METADATA_FILE),
      `${JSON.stringify(metadata, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    if (isNodeError(error) && (error.code === "EEXIST" || error.code === "ENOENT")) {
      return;
    }

    throw error;
  }
}

// Retired destination 由舊 guard identity 決定；既有非空 destination 會讓晚到 contender fail closed。
async function retireStateGuard(
  guardDir: string,
  observed: StateGuardObservation,
): Promise<boolean> {
  const retiredDir = getRetiredStateGuardPath(guardDir, observed.identity);

  try {
    await rename(guardDir, retiredDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }

    if (isNodeError(error) && (error.code === "EEXIST" || error.code === "ENOTEMPTY")) {
      return false;
    }

    throw error;
  }

  await writeRetiredStateGuardMetadata(retiredDir, observed.identity);
  return true;
}

async function writeRetiredStateGuardMetadata(retiredDir: string, identity: string): Promise<void> {
  try {
    await writeFile(
      join(retiredDir, RETIRED_STATE_GUARD_METADATA_FILE),
      `${JSON.stringify({ identity, retiredAt: new Date().toISOString() }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      return;
    }

    // Rename 已完成；缺少 pruning metadata 時保守保留 tombstone，不讓主鎖 handle 遺失。
  }
}

async function pruneRetiredStateGuards(guardDir: string): Promise<void> {
  const parentDir = dirname(guardDir);
  const retiredPrefix = `${basename(guardDir)}.retired-`;
  const entries = await readdir(parentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.name.startsWith(retiredPrefix)) {
      continue;
    }

    const retiredDir = join(parentDir, entry.name);
    const stats = await readExpectedDirectory(retiredDir, "Retired filesystem lock state guard");

    if (stats === null) {
      continue;
    }

    const retiredAt = await readRetiredStateGuardTimestamp(retiredDir);
    if (retiredAt === null || Date.now() - retiredAt < RETIRED_STATE_GUARD_GRACE_MS) {
      continue;
    }

    await rm(retiredDir, { recursive: true, force: true });
  }
}

// 同一 process 每個 grace window 最多掃描一次；延後清理只會保留安全 tombstone。
async function maybePruneRetiredStateGuards(guardDir: string): Promise<void> {
  const pruneKey = guardDir;
  const now = Date.now();
  const lastPrunedAt = lastRetiredStateGuardPruneAt.get(pruneKey) ?? 0;

  if (now - lastPrunedAt < RETIRED_STATE_GUARD_GRACE_MS) {
    return;
  }

  lastRetiredStateGuardPruneAt.set(pruneKey, now);

  try {
    await pruneRetiredStateGuards(guardDir);
  } catch (error) {
    lastRetiredStateGuardPruneAt.delete(pruneKey);
    throw error;
  }
}

async function readRetiredStateGuardTimestamp(retiredDir: string): Promise<number | null> {
  try {
    const raw = await readFile(join(retiredDir, RETIRED_STATE_GUARD_METADATA_FILE), "utf8");
    const parsed = JSON.parse(raw) as { retiredAt?: unknown };
    const retiredAt =
      typeof parsed.retiredAt === "string" ? Date.parse(parsed.retiredAt) : Number.NaN;

    return Number.isFinite(retiredAt) ? retiredAt : null;
  } catch (error) {
    if ((isNodeError(error) && error.code === "ENOENT") || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

async function readStateGuardObservation(guardDir: string): Promise<StateGuardObservation | null> {
  const stats = await readExpectedDirectory(guardDir, "Filesystem lock state guard");

  if (stats === null) {
    return null;
  }

  const metadata = await readStateGuardMetadata(guardDir);
  const identitySource = metadata
    ? `token:${metadata.token}`
    : `stat:${stats.dev}:${stats.ino}:${Math.trunc(stats.mtimeMs)}`;

  return {
    acquiredAt: metadata?.acquiredAt ?? stats.mtime.toISOString(),
    identity: createHash("sha256").update(identitySource).digest("hex"),
    metadata,
  };
}

async function readStateGuardMetadata(guardDir: string): Promise<StateGuardMetadata | null> {
  try {
    const raw = await readFile(join(guardDir, STATE_GUARD_METADATA_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<StateGuardMetadata>;

    if (
      typeof parsed.token === "string" &&
      typeof parsed.pid === "number" &&
      typeof parsed.acquiredAt === "string" &&
      Number.isFinite(Date.parse(parsed.acquiredAt))
    ) {
      return parsed as StateGuardMetadata;
    }
  } catch (error) {
    if ((isNodeError(error) && error.code === "ENOENT") || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }

  return null;
}

async function assertStateGuardOwned(guardDir: string, token: string): Promise<void> {
  const metadata = await readStateGuardMetadata(guardDir);

  if (metadata?.token !== token) {
    throw new Error(`Filesystem lock state guard ownership was lost: ${guardDir}`);
  }
}

function isStateGuardStale(observed: StateGuardObservation): boolean {
  return Date.now() - Date.parse(observed.acquiredAt) >= STATE_GUARD_STALE_MS;
}

function getRetiredStateGuardPath(guardDir: string, identity: string): string {
  return `${guardDir}.retired-${identity}`;
}

// 缺少或損壞 metadata 時改用 lock directory mtime，避免剛 mkdir、尚未寫 metadata 的鎖被立即搶走。
async function readExistingLock(
  lockDir: string,
): Promise<{ acquiredAt: string; hasMetadata: boolean } | null> {
  const stats = await readExpectedDirectory(lockDir, "Filesystem lock path");

  if (stats === null) {
    return null;
  }

  const metadata = await readLockMetadata(lockDir);

  return {
    acquiredAt: metadata?.acquiredAt ?? stats.mtime.toISOString(),
    hasMetadata: metadata !== null,
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
