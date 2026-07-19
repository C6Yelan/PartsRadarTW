// 保存 scheduled crawler 的非 DB 執行狀態，讓 lock contention 不必偽裝成 crawl run。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type CrawlerDaemonCycleResult =
  | "SUCCESS"
  | "SOURCE_FAILURE"
  | "SUSPECTED_BLOCK"
  | "PARSE_FAILURE"
  | "LOCK_BUSY"
  | "INTERNAL_FAILURE";

export interface CrawlerRuntimeStatus {
  version: 1;
  state: "IDLE" | "RUNNING" | "WAITING_LOCK" | "BACKOFF";
  cycleResult: CrawlerDaemonCycleResult;
  observedAt: string;
  nextAttemptAt: string | null;
  lockBusySince: string | null;
  consecutiveLockBusyCount: number;
}

export async function writeCrawlerRuntimeStatus(
  path: string,
  status: CrawlerRuntimeStatus,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export async function readCrawlerRuntimeStatus(
  path: string | null | undefined,
): Promise<CrawlerRuntimeStatus | null> {
  if (!path) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return isCrawlerRuntimeStatus(value) ? value : null;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

export function isActiveCrawlerLockWait(
  status: CrawlerRuntimeStatus | null,
  now: Date,
): status is CrawlerRuntimeStatus {
  if (status?.state !== "WAITING_LOCK" || status.cycleResult !== "LOCK_BUSY") {
    return false;
  }

  const observedAt = new Date(status.observedAt).getTime();
  return Number.isFinite(observedAt) && now.getTime() - observedAt <= 10 * 60 * 1000;
}

function isCrawlerRuntimeStatus(value: unknown): value is CrawlerRuntimeStatus {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CrawlerRuntimeStatus>;
  return (
    candidate.version === 1 &&
    ["IDLE", "RUNNING", "WAITING_LOCK", "BACKOFF"].includes(candidate.state ?? "") &&
    [
      "SUCCESS",
      "SOURCE_FAILURE",
      "SUSPECTED_BLOCK",
      "PARSE_FAILURE",
      "LOCK_BUSY",
      "INTERNAL_FAILURE",
    ].includes(candidate.cycleResult ?? "") &&
    typeof candidate.observedAt === "string" &&
    Number.isFinite(new Date(candidate.observedAt).getTime()) &&
    (typeof candidate.nextAttemptAt === "string" || candidate.nextAttemptAt === null) &&
    (candidate.nextAttemptAt === null ||
      Number.isFinite(new Date(candidate.nextAttemptAt).getTime())) &&
    (typeof candidate.lockBusySince === "string" || candidate.lockBusySince === null) &&
    (candidate.lockBusySince === null ||
      Number.isFinite(new Date(candidate.lockBusySince).getTime())) &&
    Number.isSafeInteger(candidate.consecutiveLockBusyCount) &&
    (candidate.consecutiveLockBusyCount ?? -1) >= 0
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
