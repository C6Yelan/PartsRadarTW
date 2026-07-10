// apps/crawler/tests/scripts/ops/cleanup-raw-snapshots-daemon.test.ts
// 驗證 raw snapshot cleanup daemon 的刪除確認、排程參數、run-once 與失敗後續跑行為。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type RawSnapshotCleanupDaemonOptions,
  parseRawSnapshotCleanupDaemonOptions,
  runRawSnapshotCleanupDaemon,
} from "../../../src/scripts/ops/cleanup-raw-snapshots-daemon";

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
      }),
    ).rejects.toThrow(error);
  });

  it("keeps daemon loop alive after a cleanup failure", async () => {
    const logs: string[] = [];
    const shutdown = createFakeShutdown();

    await expect(
      runRawSnapshotCleanupDaemon({
        client: {} as never,
        options: createDaemonOptions({ runOnce: false, intervalSeconds: 3600 }),
        shutdown,
        cleanup: async () => {
          throw new Error("temporary cleanup failure");
        },
        acquireMutationLock: async () => createFakeMutationLock(),
        logMessage: (message) => logs.push(message),
      }),
    ).resolves.toBeUndefined();
    expect(logs).toContain("Raw snapshot cleanup cycle failed: temporary cleanup failure");
    expect(shutdown.sleepCalls).toEqual([3600 * 1000]);
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
      }),
    ).rejects.toThrow("another crawler or cleanup process holds the mutation lock");
    expect(cleanupCalls).toBe(0);
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

async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-cleanup-daemon-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });

  return { workspaceRoot, crawlerCwd };
}
