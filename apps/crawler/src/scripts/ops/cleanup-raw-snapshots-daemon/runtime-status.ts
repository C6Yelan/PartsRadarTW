// 保存 raw snapshot cleanup daemon 的非 DB 執行狀態，供 smoke 判斷持續 lock contention。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type RawSnapshotCleanupCycleResult =
  | "SUCCESS"
  | "LOCK_BUSY"
  | "CLEANUP_FAILURE"
  | "INTERNAL_FAILURE";

export interface RawSnapshotCleanupRuntimeStatus {
  version: 1;
  state: "IDLE" | "WAITING_LOCK" | "BACKOFF";
  cycleResult: RawSnapshotCleanupCycleResult;
  observedAt: string;
  nextAttemptAt: string | null;
  lockBusySince: string | null;
  consecutiveLockBusyCount: number;
  persistentLockBusy: boolean;
}

export async function writeRawSnapshotCleanupRuntimeStatus(
  path: string,
  status: RawSnapshotCleanupRuntimeStatus,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export async function readRawSnapshotCleanupRuntimeStatus(
  path: string | null | undefined,
): Promise<RawSnapshotCleanupRuntimeStatus | null> {
  if (!path) return null;

  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRuntimeStatus(value) ? value : null;
  } catch {
    return null;
  }
}

export function isActivePersistentCleanupLockWait(
  status: RawSnapshotCleanupRuntimeStatus | null,
  now: Date,
): status is RawSnapshotCleanupRuntimeStatus {
  if (
    status?.state !== "WAITING_LOCK" ||
    status.cycleResult !== "LOCK_BUSY" ||
    !status.persistentLockBusy
  ) {
    return false;
  }

  const observedAt = new Date(status.observedAt).getTime();
  return Number.isFinite(observedAt) && now.getTime() - observedAt <= 15 * 60 * 1000;
}

function isRuntimeStatus(value: unknown): value is RawSnapshotCleanupRuntimeStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RawSnapshotCleanupRuntimeStatus>;
  return (
    candidate.version === 1 &&
    ["IDLE", "WAITING_LOCK", "BACKOFF"].includes(candidate.state ?? "") &&
    ["SUCCESS", "LOCK_BUSY", "CLEANUP_FAILURE", "INTERNAL_FAILURE"].includes(
      candidate.cycleResult ?? "",
    ) &&
    typeof candidate.observedAt === "string" &&
    Number.isFinite(new Date(candidate.observedAt).getTime()) &&
    (candidate.nextAttemptAt === null ||
      (typeof candidate.nextAttemptAt === "string" &&
        Number.isFinite(new Date(candidate.nextAttemptAt).getTime()))) &&
    (candidate.lockBusySince === null ||
      (typeof candidate.lockBusySince === "string" &&
        Number.isFinite(new Date(candidate.lockBusySince).getTime()))) &&
    Number.isSafeInteger(candidate.consecutiveLockBusyCount) &&
    (candidate.consecutiveLockBusyCount ?? -1) >= 0 &&
    typeof candidate.persistentLockBusy === "boolean"
  );
}
