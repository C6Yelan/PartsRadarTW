// 驗證 cleanup runtime status 的原子寫入、嚴格讀取與持續撞鎖判斷。

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isActivePersistentCleanupLockWait,
  readRawSnapshotCleanupRuntimeStatus,
  writeRawSnapshotCleanupRuntimeStatus,
} from "../../../../src/scripts/ops/cleanup-raw-snapshots-daemon/runtime-status";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("raw snapshot cleanup runtime status", () => {
  it("round-trips a persistent lock wait", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-cleanup-runtime-"));
    const path = join(root, "ops", "cleanup-runtime-status.json");
    tempRoots.push(root);
    const status = {
      version: 1 as const,
      state: "WAITING_LOCK" as const,
      cycleResult: "LOCK_BUSY" as const,
      observedAt: "2026-07-19T04:43:04.000Z",
      nextAttemptAt: "2026-07-19T04:53:04.000Z",
      lockBusySince: "2026-07-19T04:38:04.000Z",
      consecutiveLockBusyCount: 6,
      persistentLockBusy: true,
    };

    await writeRawSnapshotCleanupRuntimeStatus(path, status);
    const stored = await readRawSnapshotCleanupRuntimeStatus(path);

    expect(stored).toEqual(status);
    expect(isActivePersistentCleanupLockWait(stored, new Date("2026-07-19T04:44:04.000Z"))).toBe(
      true,
    );
  });

  it("ignores malformed, missing, or stale status", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-cleanup-runtime-"));
    const path = join(root, "cleanup-runtime-status.json");
    tempRoots.push(root);
    await writeFile(path, '{"version":1,"state":"WAITING_LOCK"}', "utf8");

    await expect(readRawSnapshotCleanupRuntimeStatus(path)).resolves.toBeNull();
    await expect(
      readRawSnapshotCleanupRuntimeStatus(join(root, "missing.json")),
    ).resolves.toBeNull();
  });
});
