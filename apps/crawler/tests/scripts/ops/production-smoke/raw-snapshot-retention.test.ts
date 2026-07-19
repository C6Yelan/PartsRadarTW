// 驗證 raw snapshot retention smoke 保留既有門檻，並揭露持續 cleanup lock contention。

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeRawSnapshotCleanupRuntimeStatus } from "../../../../src/scripts/ops/cleanup-raw-snapshots-daemon/runtime-status";
import { checkRawSnapshotRetention } from "../../../../src/scripts/ops/production-smoke/checks/raw-snapshot-retention";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("raw snapshot retention smoke", () => {
  it("warns with the local lock reason only after short retries are exhausted", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-retention-runtime-"));
    const runtimePath = join(root, "cleanup-runtime-status.json");
    tempRoots.push(root);
    await writeRawSnapshotCleanupRuntimeStatus(runtimePath, {
      version: 1,
      state: "WAITING_LOCK",
      cycleResult: "LOCK_BUSY",
      observedAt: "2026-07-19T04:43:04.000Z",
      nextAttemptAt: "2026-07-19T04:53:04.000Z",
      lockBusySince: "2026-07-19T04:38:04.000Z",
      consecutiveLockBusyCount: 6,
      persistentLockBusy: true,
    });
    const count = vi.fn().mockResolvedValue(0);

    const result = await checkRawSnapshotRetention(
      { rawSnapshot: { count } } as never,
      {
        rawSnapshotNormalRetentionDays: 30,
        rawSnapshotAbnormalRetentionDays: 90,
        rawSnapshotRetentionGraceDays: 2,
        rawSnapshotWarnCount: 1,
        rawSnapshotFailCount: 100,
        rawSnapshotCleanupRuntimeStatusFilePath: runtimePath,
      } as never,
      new Date("2026-07-19T04:44:04.000Z"),
    );

    expect(result).toEqual({
      name: "raw snapshot retention",
      status: "WARN",
      message:
        "expired=0 normal=0 abnormal=0; Snapshot cleanup waiting for crawler storage lock since=2026-07-19T04:38:04.000Z retry=6",
    });
  });

  it("keeps healthy retention OK during ordinary short lock retries", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-retention-runtime-"));
    const runtimePath = join(root, "cleanup-runtime-status.json");
    tempRoots.push(root);
    await writeRawSnapshotCleanupRuntimeStatus(runtimePath, {
      version: 1,
      state: "WAITING_LOCK",
      cycleResult: "LOCK_BUSY",
      observedAt: "2026-07-19T04:43:04.000Z",
      nextAttemptAt: "2026-07-19T04:44:04.000Z",
      lockBusySince: "2026-07-19T04:43:04.000Z",
      consecutiveLockBusyCount: 1,
      persistentLockBusy: false,
    });
    const count = vi.fn().mockResolvedValue(0);

    const result = await checkRawSnapshotRetention(
      { rawSnapshot: { count } } as never,
      {
        rawSnapshotNormalRetentionDays: 30,
        rawSnapshotAbnormalRetentionDays: 90,
        rawSnapshotRetentionGraceDays: 2,
        rawSnapshotWarnCount: 1,
        rawSnapshotFailCount: 100,
        rawSnapshotCleanupRuntimeStatusFilePath: runtimePath,
      } as never,
      new Date("2026-07-19T04:44:04.000Z"),
    );

    expect(result).toMatchObject({ status: "OK", message: "expired=0 normal=0 abnormal=0" });
  });
});
