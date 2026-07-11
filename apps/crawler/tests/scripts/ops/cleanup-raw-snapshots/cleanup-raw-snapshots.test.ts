// apps/crawler/tests/scripts/ops/cleanup-raw-snapshots/cleanup-raw-snapshots.test.ts
// 驗證 raw snapshot cleanup CLI 的 dry-run 預設、參數驗證、storage dir 防呆與摘要路徑格式。

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tryAcquireRawSnapshotMutationLock } from "../../../../src/coolpc/raw-snapshot-storage";
import {
  formatStorageDirForSummary,
  normalizeCleanupArgs,
  parseCleanupOptions,
  runRawSnapshotCleanup,
  validateCleanupArgs,
} from "../../../../src/scripts/ops/cleanup-raw-snapshots";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("raw snapshot cleanup CLI options", () => {
  it("defaults to dry-run unless --confirm-delete is provided", async () => {
    const workspaceRoot = await createTempRoot();

    expect(parseCleanupOptions([], workspaceRoot, {}).dryRun).toBe(true);
    expect(parseCleanupOptions(["--confirm-delete"], workspaceRoot, {}).dryRun).toBe(false);
  });

  it("rejects unknown flags and mistyped retention flags", async () => {
    expect(() => validateCleanupArgs(["--unknown"])).toThrow(
      "Unknown raw snapshot cleanup option: --unknown",
    );
    expect(() => validateCleanupArgs(["--normal-retention-day", "30"])).toThrow(
      "Unknown raw snapshot cleanup option: --normal-retention-day",
    );
  });

  it("rejects value flags without a value", async () => {
    expect(() => validateCleanupArgs(["--storage-dir"])).toThrow(
      "Missing value for --storage-dir.",
    );
    expect(() => validateCleanupArgs(["--storage-dir", "--confirm-delete"])).toThrow(
      "Missing value for --storage-dir.",
    );
  });

  it("ignores standalone pnpm argument separators before validation", async () => {
    const workspaceRoot = await createTempRoot();

    expect(normalizeCleanupArgs(["--", "--normal-retention-days", "1"])).toEqual([
      "--normal-retention-days",
      "1",
    ]);
    expect(
      parseCleanupOptions(
        ["--", "--normal-retention-days", "1", "--abnormal-retention-days", "1"],
        workspaceRoot,
        {},
      ),
    ).toMatchObject({
      normalRetentionDays: 1,
      abnormalRetentionDays: 1,
      dryRun: true,
    });
  });

  it("rejects unexpected positional arguments", async () => {
    expect(() => validateCleanupArgs(["--confirm-delete", "false"])).toThrow(
      "Unexpected raw snapshot cleanup argument: false",
    );
  });

  it("rejects unsafe storage dirs", async () => {
    const workspaceRoot = await createTempRoot();

    expect(() => parseCleanupOptions(["--storage-dir", ""], workspaceRoot, {})).toThrow(
      "value must not be empty",
    );
    expect(() => parseCleanupOptions(["--storage-dir", "/"], workspaceRoot, {})).toThrow(
      "filesystem root cannot be used",
    );
    expect(() => parseCleanupOptions(["--storage-dir", workspaceRoot], workspaceRoot, {})).toThrow(
      "workspace root cannot be used",
    );
  });

  it("allows configured roots, their children, and explicitly injected test roots", async () => {
    const workspaceRoot = await createTempRoot();
    const configuredRoot = join(workspaceRoot, "configured-snapshots");
    const testRoot = join(workspaceRoot, "test-snapshots");
    await mkdir(configuredRoot);
    await mkdir(testRoot);

    expect(
      parseCleanupOptions(["--storage-dir", join(configuredRoot, "child")], workspaceRoot, {
        SNAPSHOT_STORAGE_DIR: configuredRoot,
      }),
    ).toMatchObject({
      storageDir: join(configuredRoot, "child"),
      mutationRoot: configuredRoot,
      storagePathPrefix: "child",
    });
    expect(
      parseCleanupOptions(
        ["--storage-dir", testRoot],
        workspaceRoot,
        {},
        {
          additionalAllowedRootsForTesting: [testRoot],
        },
      ),
    ).toMatchObject({
      storageDir: testRoot,
      mutationRoot: testRoot,
      storagePathPrefix: "",
    });
  });

  it("does not keep the built-in root active when SNAPSHOT_STORAGE_DIR is configured", async () => {
    const workspaceRoot = await createTempRoot();
    const configuredRoot = join(workspaceRoot, "configured-snapshots");
    await mkdir(configuredRoot);

    expect(() =>
      parseCleanupOptions(
        ["--confirm-delete", "--storage-dir", "temp/coolpc-daemon/snapshots"],
        workspaceRoot,
        { SNAPSHOT_STORAGE_DIR: configuredRoot },
      ),
    ).toThrow("not within an allowlisted snapshot storage root");
  });

  it("rejects non-allowlisted paths in dry-run and delete modes", async () => {
    const workspaceRoot = await createTempRoot();

    for (const args of [
      ["--storage-dir", "temp/arbitrary-snapshots"],
      ["--confirm-delete", "--storage-dir", "temp/arbitrary-snapshots"],
    ]) {
      expect(() => parseCleanupOptions(args, workspaceRoot, {})).toThrow(
        "not within an allowlisted snapshot storage root",
      );
    }
  });

  it("rejects invalid retention day values", async () => {
    const workspaceRoot = await createTempRoot();

    for (const value of ["0", "-1", "1.5", "abc"]) {
      expect(() =>
        parseCleanupOptions(["--normal-retention-days", value], workspaceRoot, {}),
      ).toThrow();
      expect(() =>
        parseCleanupOptions(["--abnormal-retention-days", value], workspaceRoot, {}),
      ).toThrow();
    }
  });

  it("formats workspace paths relatively and external paths absolutely", async () => {
    const workspaceRoot = await createTempRoot();

    expect(formatStorageDirForSummary(workspaceRoot, join(workspaceRoot, "temp", "raw"))).toBe(
      join("temp", "raw"),
    );
    expect(formatStorageDirForSummary(workspaceRoot, "/var/lib/partsradar/snapshots")).toBe(
      "/var/lib/partsradar/snapshots",
    );
  });
});

describe("raw snapshot cleanup mutation lock", () => {
  it("keeps dry-run lock-free while an active writer holds the storage lock", async () => {
    const workspaceRoot = await createTempRoot();
    const options = parseCleanupOptions([], workspaceRoot, {});
    const writerLock = await tryAcquireRawSnapshotMutationLock({
      mutationRoot: options.mutationRoot,
      owner: "test-writer",
    });
    const acquireMutationLock = vi.fn(tryAcquireRawSnapshotMutationLock);
    const cleanup = vi.fn(async () => createCleanupResult(true));

    await expect(
      runRawSnapshotCleanup({
        client: {} as never,
        options,
        owner: "test-cleanup",
        cleanup,
        acquireMutationLock,
      }),
    ).resolves.toMatchObject({ dryRun: true });
    expect(acquireMutationLock).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    await expect(
      tryAcquireRawSnapshotMutationLock({
        mutationRoot: options.mutationRoot,
        owner: "second-writer",
      }),
    ).resolves.toBeNull();

    await writerLock?.release();
  });

  it("fails confirmed cleanup without deleting when a writer holds the lock", async () => {
    const workspaceRoot = await createTempRoot();
    const options = parseCleanupOptions(["--confirm-delete"], workspaceRoot, {});
    const writerLock = await tryAcquireRawSnapshotMutationLock({
      mutationRoot: options.mutationRoot,
      owner: "test-writer",
    });
    const cleanup = vi.fn(async () => createCleanupResult(false));

    await expect(
      runRawSnapshotCleanup({
        client: {} as never,
        options,
        owner: "test-cleanup",
        cleanup,
      }),
    ).rejects.toThrow("another crawler or cleanup process holds the mutation lock");
    expect(cleanup).not.toHaveBeenCalled();

    await writerLock?.release();
  });

  it("releases the cleanup lock when deletion fails", async () => {
    const workspaceRoot = await createTempRoot();
    const options = parseCleanupOptions(["--confirm-delete"], workspaceRoot, {});
    const release = vi.fn(async () => {});

    await expect(
      runRawSnapshotCleanup({
        client: {} as never,
        options,
        owner: "test-cleanup",
        cleanup: async () => {
          throw new Error("delete failed");
        },
        acquireMutationLock: (async () => ({
          lockDir: join(options.mutationRoot, ".locks", "raw-snapshot-mutation"),
          owner: "test-cleanup",
          release,
        })) as never,
      }),
    ).rejects.toThrow("delete failed");
    expect(release).toHaveBeenCalledOnce();
  });

  it("cleans global metadata paths from the matched root when a controlled child is selected", async () => {
    const workspaceRoot = await createTempRoot();
    const configuredRoot = join(workspaceRoot, "configured-snapshots");
    const options = parseCleanupOptions(
      ["--confirm-delete", "--storage-dir", join(configuredRoot, "child")],
      workspaceRoot,
      { SNAPSHOT_STORAGE_DIR: configuredRoot },
    );
    const cleanup = vi.fn(async () => createCleanupResult(false));

    await runRawSnapshotCleanup({
      client: {} as never,
      options,
      owner: "test-cleanup",
      cleanup,
      acquireMutationLock: (async () => ({
        lockDir: join(configuredRoot, ".locks", "raw-snapshot-mutation"),
        owner: "test-cleanup",
        async release() {},
      })) as never,
    });

    expect(cleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        storageDir: configuredRoot,
        dryRun: false,
      }),
    );
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "partsradar-cleanup-cli-"));
  tempRoots.push(root);
  return root;
}

function createCleanupResult(dryRun: boolean) {
  return {
    dryRun,
    now: new Date("2026-07-10T00:00:00.000Z"),
    normalCutoff: new Date("2026-06-10T00:00:00.000Z"),
    abnormalCutoff: new Date("2026-04-11T00:00:00.000Z"),
    candidateMetadataCount: 1,
    deletedMetadataCount: dryRun ? 0 : 1,
    candidateCompressedFilePathCount: 1,
    retainedCompressedFilePathCount: 0,
    deletableCompressedFilePathCount: 1,
    deletedCompressedFileCount: dryRun ? 0 : 1,
    missingCompressedFileCount: 0,
  };
}
