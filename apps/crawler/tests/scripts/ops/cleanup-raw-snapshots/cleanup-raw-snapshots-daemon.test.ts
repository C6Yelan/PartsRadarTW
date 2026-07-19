// apps/crawler/tests/scripts/ops/cleanup-raw-snapshots/cleanup-raw-snapshots-daemon.test.ts
// 驗證 raw snapshot cleanup daemon 的刪除確認、排程參數、run-once 與失敗後續跑行為。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RawSnapshotCleanupExecutionError } from "../../../../src/scripts/ops/cleanup-raw-snapshots";
import {
  resolveCleanupLockBusyRetrySeconds,
  runRawSnapshotCleanupDaemon,
} from "../../../../src/scripts/ops/cleanup-raw-snapshots-daemon";
import {
  parseRawSnapshotCleanupDaemonOptions,
  type RawSnapshotCleanupDaemonOptions,
} from "../../../../src/scripts/ops/cleanup-raw-snapshots-daemon/options";

const tempRoots: string[] = [];
const SUCCESSFUL_CLEANUP_RESULT = {
  dryRun: false,
  now: new Date("2026-06-01T00:00:00.000Z"),
  normalCutoff: new Date("2026-05-02T00:00:00.000Z"),
  abnormalCutoff: new Date("2026-03-03T00:00:00.000Z"),
  candidateMetadataCount: 0,
  deletedMetadataCount: 0,
  candidateCompressedFilePathCount: 0,
  retainedCompressedFilePathCount: 0,
  deletableCompressedFilePathCount: 0,
  deletedCompressedFileCount: 0,
  missingCompressedFileCount: 0,
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("raw snapshot cleanup daemon options", () => {
  it("requires explicit confirm-delete", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() => parseRawSnapshotCleanupDaemonOptions([], {}, crawlerCwd)).toThrow(
      "Refusing scheduled raw snapshot cleanup without --confirm-delete",
    );
  });

  it("uses daily cleanup defaults with confirm-delete", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();

    expect(
      parseRawSnapshotCleanupDaemonOptions(["--confirm-delete"], {}, crawlerCwd),
    ).toMatchObject({
      workspaceRoot,
      storageDir: join(workspaceRoot, "temp", "coolpc-daemon", "snapshots"),
      normalRetentionDays: 30,
      abnormalRetentionDays: 90,
      dryRun: false,
      intervalSeconds: 86400,
      initialDelaySeconds: 300,
      lockBusyRetrySeconds: 60,
      lockBusyMaxRetries: 5,
      runOnce: false,
    });
  });

  it("accepts Docker storage paths, custom interval, retention, and run-once", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(
      parseRawSnapshotCleanupDaemonOptions(
        [
          "--confirm-delete",
          "--run-once",
          "--interval-seconds",
          "7200",
          "--storage-dir",
          "/var/lib/partsradar/snapshots",
          "--normal-retention-days",
          "7",
          "--abnormal-retention-days",
          "14",
        ],
        { SNAPSHOT_STORAGE_DIR: "/var/lib/partsradar/snapshots" },
        crawlerCwd,
      ),
    ).toMatchObject({
      storageDir: "/var/lib/partsradar/snapshots",
      normalRetentionDays: 7,
      abnormalRetentionDays: 14,
      dryRun: false,
      intervalSeconds: 7200,
      initialDelaySeconds: 300,
      lockBusyRetrySeconds: 60,
      lockBusyMaxRetries: 5,
      runOnce: true,
    });
  });

  it("reads interval from env", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete"],
        { RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS: "43200" },
        crawlerCwd,
      ).intervalSeconds,
    ).toBe(43200);
  });

  it("reads and validates the startup delay from env", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete"],
        { RAW_SNAPSHOT_CLEANUP_INITIAL_DELAY_SECONDS: "180" },
        crawlerCwd,
      ).initialDelaySeconds,
    ).toBe(180);
    expect(() =>
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete"],
        { RAW_SNAPSHOT_CLEANUP_INITIAL_DELAY_SECONDS: "3601" },
        crawlerCwd,
      ),
    ).toThrow("between 0 and 3600 seconds");
  });

  it("reads and validates lock busy retry settings from env", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseRawSnapshotCleanupDaemonOptions(
      ["--confirm-delete"],
      {
        RAW_SNAPSHOT_CLEANUP_LOCK_BUSY_RETRY_SECONDS: "45",
        RAW_SNAPSHOT_CLEANUP_LOCK_BUSY_MAX_RETRIES: "3",
      },
      crawlerCwd,
    );

    expect(options.lockBusyRetrySeconds).toBe(45);
    expect(options.lockBusyMaxRetries).toBe(3);
    expect(() =>
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete"],
        { RAW_SNAPSHOT_CLEANUP_LOCK_BUSY_RETRY_SECONDS: "29" },
        crawlerCwd,
      ),
    ).toThrow("between 30 and 60");
    expect(() =>
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete"],
        { RAW_SNAPSHOT_CLEANUP_LOCK_BUSY_MAX_RETRIES: "11" },
        crawlerCwd,
      ),
    ).toThrow("between 1 and 10");
  });

  it("rejects too frequent cleanup intervals", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete", "--interval-seconds", "3599"],
        {},
        crawlerCwd,
      ),
    ).toThrow("between 3600 and 604800 seconds");
  });

  it("rejects cleanup intervals over seven days", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete", "--interval-seconds", "604801"],
        {},
        crawlerCwd,
      ),
    ).toThrow("between 3600 and 604800 seconds");
  });

  it("accepts cleanup intervals from one hour through seven days", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete", "--interval-seconds", "3600"],
        {},
        crawlerCwd,
      ).intervalSeconds,
    ).toBe(3600);
    expect(
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete", "--interval-seconds", "604800"],
        {},
        crawlerCwd,
      ).intervalSeconds,
    ).toBe(604800);
  });

  it("rejects unknown flags and missing daemon values", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseRawSnapshotCleanupDaemonOptions(["--confirm-delete", "--unknown"], {}, crawlerCwd),
    ).toThrow("Unknown raw snapshot cleanup daemon option: --unknown");
    expect(() =>
      parseRawSnapshotCleanupDaemonOptions(
        ["--confirm-delete", "--interval-seconds"],
        {},
        crawlerCwd,
      ),
    ).toThrow("Missing value for --interval-seconds.");
  });

  it("throws cleanup failures in run-once mode", async () => {
    const error = new Error("cleanup failed");

    await expect(
      runRawSnapshotCleanupDaemon({
        client: {} as never,
        options: createDaemonOptions({ runOnce: true }),
        shutdown: createFakeShutdown(),
        cleanup: async () => {
          throw error;
        },
        acquireMutationLock: async () => createFakeMutationLock(),
        logMessage: () => {},
        writeRuntimeStatus: async () => {},
      }),
    ).rejects.toBeInstanceOf(RawSnapshotCleanupExecutionError);
  });

  it("keeps daemon loop alive after a cleanup failure", async () => {
    const logs: Array<{ message: string; fields?: Record<string, unknown> }> = [];
    const shutdown = createFakeShutdown();

    await expect(
      runRawSnapshotCleanupDaemon({
        client: {} as never,
        options: createDaemonOptions({
          runOnce: false,
          intervalSeconds: 3600,
          initialDelaySeconds: 0,
        }),
        shutdown,
        cleanup: async () => {
          throw new Error("temporary cleanup failure");
        },
        acquireMutationLock: async () => createFakeMutationLock(),
        logMessage: (message, fields) => logs.push({ message, fields }),
        writeRuntimeStatus: async () => {},
      }),
    ).resolves.toBeUndefined();
    expect(logs).toContainEqual({
      message: "Raw snapshot cleanup cycle failed.",
      fields: {
        cycleResult: "CLEANUP_FAILURE",
        error: "temporary cleanup failure",
      },
    });
    expect(shutdown.sleepCalls).toEqual([15 * 60 * 1000]);
  });

  it("delays the first daemon cleanup cycle so crawler startup has priority", async () => {
    const calls: string[] = [];
    const sleepCalls: number[] = [];
    const shutdown = {
      get requested() {
        return sleepCalls.length >= 2;
      },
      sleepCalls,
      async sleep(ms: number) {
        sleepCalls.push(ms);
      },
    };

    await runRawSnapshotCleanupDaemon({
      client: {} as never,
      options: createDaemonOptions({
        runOnce: false,
        intervalSeconds: 3600,
        initialDelaySeconds: 300,
      }),
      shutdown,
      cleanup: async () => {
        calls.push("cleanup");
        return SUCCESSFUL_CLEANUP_RESULT;
      },
      acquireMutationLock: async () => createFakeMutationLock(),
      logMessage: () => {},
      writeRuntimeStatus: async () => {},
    });

    expect(calls).toEqual(["cleanup"]);
    expect(shutdown.sleepCalls).toEqual([300_000, 3_600_000]);
  });

  it("runs one successful cleanup cycle in run-once mode", async () => {
    let cleanupCalls = 0;

    await runRawSnapshotCleanupDaemon({
      client: {} as never,
      options: createDaemonOptions({ runOnce: true }),
      shutdown: createFakeShutdown(),
      cleanup: async () => {
        cleanupCalls += 1;
        return SUCCESSFUL_CLEANUP_RESULT;
      },
      acquireMutationLock: async () => createFakeMutationLock(),
      logMessage: () => {},
      writeRuntimeStatus: async () => {},
    });

    expect(cleanupCalls).toBe(1);
  });

  it("does not invoke daemon cleanup when the mutation lock is busy", async () => {
    let cleanupCalls = 0;

    await expect(
      runRawSnapshotCleanupDaemon({
        client: {} as never,
        options: createDaemonOptions({ runOnce: true }),
        shutdown: createFakeShutdown(),
        cleanup: async () => {
          cleanupCalls += 1;
          return SUCCESSFUL_CLEANUP_RESULT;
        },
        acquireMutationLock: async () => null,
        logMessage: () => {},
        writeRuntimeStatus: async () => {},
      }),
    ).rejects.toThrow("another crawler or cleanup process holds the mutation lock");
    expect(cleanupCalls).toBe(0);
  });

  it("retries lock busy, succeeds after release, then schedules the daily interval", async () => {
    const sleepCalls: number[] = [];
    const cycleResults: string[] = [];
    const calls: string[] = [];
    const scheduleEvents: Array<Record<string, unknown> | undefined> = [];
    let acquireCount = 0;
    const shutdown = createCountingShutdown(sleepCalls, 2);

    await runRawSnapshotCleanupDaemon({
      client: {} as never,
      options: createDaemonOptions({ initialDelaySeconds: 0 }),
      shutdown,
      acquireMutationLock: async () => {
        acquireCount += 1;
        if (acquireCount === 1) return null;
        return {
          ...createFakeMutationLock(),
          async release() {
            calls.push("release-lock");
          },
        };
      },
      cleanup: async () => {
        calls.push("cleanup");
        return SUCCESSFUL_CLEANUP_RESULT;
      },
      random: () => 1,
      now: () => new Date("2026-07-19T04:43:04.000Z"),
      logMessage: (message, fields) => {
        if (message === "Next raw snapshot cleanup scheduled.") scheduleEvents.push(fields);
      },
      writeRuntimeStatus: async (_path, status) => {
        cycleResults.push(status.cycleResult);
      },
    });

    expect(sleepCalls).toEqual([60_000, 86_400_000]);
    expect(cycleResults).toEqual(["LOCK_BUSY", "SUCCESS"]);
    expect(calls).toEqual(["cleanup", "release-lock"]);
    expect(scheduleEvents[0]).toEqual({
      cycleResult: "LOCK_BUSY",
      consecutiveLockBusyCount: 1,
      nextAttemptAt: "2026-07-19T04:44:04.000Z",
      retrySeconds: 60,
    });
    expect(scheduleEvents[1]).toEqual({
      cycleResult: "SUCCESS",
      consecutiveLockBusyCount: 0,
      nextAttemptAt: "2026-07-20T04:43:04.000Z",
      retrySeconds: 86_400,
    });
  });

  it("uses a bounded 10-minute retry after exhausting short lock retries", async () => {
    const sleepCalls: number[] = [];
    const statuses: Array<{ count: number; persistent: boolean }> = [];

    await runRawSnapshotCleanupDaemon({
      client: {} as never,
      options: createDaemonOptions({ initialDelaySeconds: 0 }),
      shutdown: createCountingShutdown(sleepCalls, 6),
      acquireMutationLock: async () => null,
      random: () => 1,
      now: () => new Date("2026-07-19T04:43:04.000Z"),
      logMessage: () => {},
      writeRuntimeStatus: async (_path, status) => {
        statuses.push({
          count: status.consecutiveLockBusyCount,
          persistent: status.persistentLockBusy,
        });
      },
    });

    expect(sleepCalls).toEqual([60_000, 60_000, 60_000, 60_000, 60_000, 600_000]);
    expect(statuses.at(-1)).toEqual({ count: 6, persistent: true });
  });

  it("stops retrying lock busy after shutdown interrupts the first sleep", async () => {
    const sleepCalls: number[] = [];
    let acquireCount = 0;

    await runRawSnapshotCleanupDaemon({
      client: {} as never,
      options: createDaemonOptions({ initialDelaySeconds: 0 }),
      shutdown: createCountingShutdown(sleepCalls, 1),
      acquireMutationLock: async () => {
        acquireCount += 1;
        return null;
      },
      random: () => 1,
      logMessage: () => {},
      writeRuntimeStatus: async () => {},
    });

    expect(acquireCount).toBe(1);
    expect(sleepCalls).toEqual([60_000]);
  });

  it("releases the mutation lock without scheduling again when shutdown arrives during cleanup", async () => {
    let requested = false;
    const releaseCalls: string[] = [];
    const sleepCalls: number[] = [];

    await runRawSnapshotCleanupDaemon({
      client: {} as never,
      options: createDaemonOptions({ initialDelaySeconds: 0 }),
      shutdown: {
        get requested() {
          return requested;
        },
        async sleep(ms: number) {
          sleepCalls.push(ms);
        },
      },
      acquireMutationLock: async () => ({
        ...createFakeMutationLock(),
        async release() {
          releaseCalls.push("release-lock");
        },
      }),
      cleanup: async () => {
        requested = true;
        return SUCCESSFUL_CLEANUP_RESULT;
      },
      logMessage: () => {},
      writeRuntimeStatus: async () => {},
    });

    expect(releaseCalls).toEqual(["release-lock"]);
    expect(sleepCalls).toEqual([]);
  });

  it("classifies lock acquisition exceptions as internal failures", async () => {
    const sleepCalls: number[] = [];
    const cycleResults: string[] = [];

    await runRawSnapshotCleanupDaemon({
      client: {} as never,
      options: createDaemonOptions({ initialDelaySeconds: 0 }),
      shutdown: createCountingShutdown(sleepCalls, 1),
      acquireMutationLock: async () => {
        throw new Error("filesystem lock metadata failed");
      },
      logMessage: () => {},
      writeRuntimeStatus: async (_path, status) => {
        cycleResults.push(status.cycleResult);
      },
    });

    expect(cycleResults).toEqual(["INTERNAL_FAILURE"]);
    expect(sleepCalls).toEqual([30 * 60 * 1000]);
  });

  it("keeps jittered short retries within 54-60 seconds", () => {
    const options = createDaemonOptions();

    expect(resolveCleanupLockBusyRetrySeconds(options, 1, () => 0)).toBe(54);
    expect(resolveCleanupLockBusyRetrySeconds(options, 5, () => 1)).toBe(60);
    expect(resolveCleanupLockBusyRetrySeconds(options, 6, () => 0)).toBe(600);
  });
});

function createDaemonOptions(
  overrides: Partial<RawSnapshotCleanupDaemonOptions> = {},
): RawSnapshotCleanupDaemonOptions {
  return {
    workspaceRoot: "/workspace",
    storageDir: "/var/lib/partsradar/snapshots",
    mutationRoot: "/var/lib/partsradar/snapshots",
    storagePathPrefix: "",
    normalRetentionDays: 30,
    abnormalRetentionDays: 90,
    dryRun: false,
    intervalSeconds: 86400,
    initialDelaySeconds: 300,
    lockBusyRetrySeconds: 60,
    lockBusyMaxRetries: 5,
    runtimeStatusFilePath: "/tmp/partsradar-test-cleanup-runtime-status.json",
    runOnce: false,
    ...overrides,
  };
}

function createFakeMutationLock() {
  return {
    lockDir: "/var/lib/partsradar/snapshots/.locks/raw-snapshot-mutation",
    owner: "test-cleanup-daemon",
    async release() {},
  };
}

function createFakeShutdown(): {
  readonly requested: boolean;
  sleepCalls: number[];
  sleep(ms: number): Promise<void>;
} {
  let requested = false;
  const sleepCalls: number[] = [];

  return {
    get requested() {
      return requested;
    },
    sleepCalls,
    async sleep(ms: number) {
      sleepCalls.push(ms);
      requested = true;
    },
  };
}

function createCountingShutdown(sleepCalls: number[], stopAfterSleeps: number) {
  return {
    get requested() {
      return sleepCalls.length >= stopAfterSleeps;
    },
    async sleep(ms: number) {
      sleepCalls.push(ms);
    },
  };
}

async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-cleanup-daemon-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });

  return { workspaceRoot, crawlerCwd };
}
