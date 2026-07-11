// apps/crawler/tests/coolpc/raw-snapshot-storage.test.ts
// 驗證 raw snapshot storage allowlist、symlink 防護與 feature-local mutation lock。

import { mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
  resolveAllowlistedRawSnapshotStorage,
  tryAcquireRawSnapshotMutationLock,
} from "../../src/coolpc/raw-snapshot-storage";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("raw snapshot storage allowlist", () => {
  it("allows the built-in root and controlled children before first use", async () => {
    const workspaceRoot = await createTempRoot();
    const expectedRoot = join(workspaceRoot, "temp", "coolpc-daemon", "snapshots");

    expect(
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
      }),
    ).toEqual({
      storageDir: expectedRoot,
      mutationRoot: expectedRoot,
      storagePathPrefix: "",
    });
    expect(
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: `${DEFAULT_RAW_SNAPSHOT_STORAGE_DIR}/replay-output`,
      }),
    ).toEqual({
      storageDir: join(expectedRoot, "replay-output"),
      mutationRoot: expectedRoot,
      storagePathPrefix: "replay-output",
    });
  });

  it("allows configured and explicitly injected roots", async () => {
    const workspaceRoot = await createTempRoot();
    const configuredRoot = join(workspaceRoot, "configured-snapshots");
    const testRoot = join(workspaceRoot, "test-snapshots");
    await mkdir(configuredRoot);
    await mkdir(testRoot);

    expect(
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: join(configuredRoot, "child"),
        configuredDir: configuredRoot,
      }),
    ).toEqual({
      storageDir: join(configuredRoot, "child"),
      mutationRoot: configuredRoot,
      storagePathPrefix: "child",
    });
    expect(
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: testRoot,
        additionalAllowedRootsForTesting: [testRoot],
      }),
    ).toEqual({
      storageDir: testRoot,
      mutationRoot: testRoot,
      storagePathPrefix: "",
    });
  });

  it("uses the configured root instead of keeping the built-in root active", async () => {
    const workspaceRoot = await createTempRoot();
    const configuredRoot = join(workspaceRoot, "configured-snapshots");
    await mkdir(configuredRoot);

    expect(() =>
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
        configuredDir: configuredRoot,
      }),
    ).toThrow("not within an allowlisted snapshot storage root");
  });

  it("rejects parents, siblings, and unrelated absolute paths", async () => {
    const workspaceRoot = await createTempRoot();

    for (const requestedDir of [
      "temp/coolpc-daemon",
      "temp/coolpc-daemon/snapshot-sibling",
      join(tmpdir(), "unconfigured-partsradar-snapshots"),
    ]) {
      expect(() => resolveAllowlistedRawSnapshotStorage({ workspaceRoot, requestedDir })).toThrow(
        "not within an allowlisted snapshot storage root",
      );
    }
  });

  it("rejects symlink escapes and broken symlinks", async () => {
    const workspaceRoot = await createTempRoot();
    const storageRoot = join(workspaceRoot, DEFAULT_RAW_SNAPSHOT_STORAGE_DIR);
    const outsideRoot = join(workspaceRoot, "outside");
    await mkdir(storageRoot, { recursive: true });
    await mkdir(outsideRoot);
    await symlink(outsideRoot, join(storageRoot, "escape"), "dir");
    await symlink(join(workspaceRoot, "missing-target"), join(storageRoot, "broken"), "dir");

    expect(() =>
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: `${DEFAULT_RAW_SNAPSHOT_STORAGE_DIR}/escape`,
      }),
    ).toThrow("symlink resolves outside its allowlisted root");
    expect(() =>
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: `${DEFAULT_RAW_SNAPSHOT_STORAGE_DIR}/broken`,
      }),
    ).toThrow("Unable to resolve snapshot storage symlink");
  });

  it("rejects a built-in root symlink that escapes the workspace", async () => {
    const workspaceRoot = await createTempRoot();
    const outsideRoot = await createTempRoot();
    const builtInParent = join(workspaceRoot, "temp", "coolpc-daemon");
    await mkdir(builtInParent, { recursive: true });
    await symlink(outsideRoot, join(builtInParent, "snapshots"), "dir");

    expect(() =>
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
      }),
    ).toThrow("symlink resolves outside the workspace");
  });

  it("rejects configured root symlinks to filesystem and workspace roots", async () => {
    const workspaceRoot = await createTempRoot();
    const filesystemRootLink = join(workspaceRoot, "filesystem-root-link");
    const workspaceRootLink = join(workspaceRoot, "workspace-root-link");
    await symlink("/", filesystemRootLink, "dir");
    await symlink(workspaceRoot, workspaceRootLink, "dir");

    expect(() =>
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: filesystemRootLink,
        configuredDir: filesystemRootLink,
      }),
    ).toThrow("filesystem root cannot be used");
    expect(() =>
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: workspaceRootLink,
        configuredDir: workspaceRootLink,
      }),
    ).toThrow("workspace root cannot be used");
  });

  it("rejects the reserved lock directory as a snapshot child", async () => {
    const workspaceRoot = await createTempRoot();

    expect(() =>
      resolveAllowlistedRawSnapshotStorage({
        workspaceRoot,
        requestedDir: `${DEFAULT_RAW_SNAPSHOT_STORAGE_DIR}/.locks`,
      }),
    ).toThrow("reserved .locks directory cannot store snapshots");
  });
});

describe("raw snapshot mutation lock", () => {
  it("stores owner metadata, excludes another holder, and releases explicitly", async () => {
    const mutationRoot = await createTempRoot();
    const firstLock = await tryAcquireRawSnapshotMutationLock({
      mutationRoot,
      owner: "first-writer",
    });
    const metadata = JSON.parse(
      await readFile(join(firstLock?.lockDir ?? "", "lock.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(firstLock).not.toBeNull();
    expect(metadata).toMatchObject({
      owner: "first-writer",
      pid: process.pid,
    });
    expect(metadata.token).toEqual(expect.any(String));
    expect(metadata.acquiredAt).toEqual(expect.any(String));
    await expect(
      tryAcquireRawSnapshotMutationLock({ mutationRoot, owner: "second-writer" }),
    ).resolves.toBeNull();

    await firstLock?.release();
    const secondLock = await tryAcquireRawSnapshotMutationLock({
      mutationRoot,
      owner: "second-writer",
    });

    expect(secondLock).not.toBeNull();
    await secondLock?.release();
  });

  it("reclaims a stale lock without letting the old handle release its replacement", async () => {
    const mutationRoot = await createTempRoot();
    const firstLock = await tryAcquireRawSnapshotMutationLock({
      mutationRoot,
      owner: "stale-writer",
      staleSeconds: 60,
      now: () => new Date("2026-07-10T00:00:00.000Z"),
    });
    const replacementLock = await tryAcquireRawSnapshotMutationLock({
      mutationRoot,
      owner: "replacement-writer",
      staleSeconds: 60,
      now: () => new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(replacementLock).not.toBeNull();
    await firstLock?.release();
    await expect(
      tryAcquireRawSnapshotMutationLock({
        mutationRoot,
        owner: "third-writer",
        staleSeconds: 60,
        now: () => new Date("2026-07-10T00:02:30.000Z"),
      }),
    ).resolves.toBeNull();

    await replacementLock?.release();
  });

  it("allows exactly one winner across repeated concurrent stale-lock contention", async () => {
    const mutationRoot = await createTempRoot();

    for (let trial = 0; trial < 20; trial += 1) {
      const staleLock = await tryAcquireRawSnapshotMutationLock({
        mutationRoot,
        owner: `stale-writer-${trial}`,
        staleSeconds: 60,
        now: () => new Date("2026-07-10T00:00:00.000Z"),
      });
      const contenders = await Promise.all(
        Array.from({ length: 32 }, (_, index) =>
          tryAcquireRawSnapshotMutationLock({
            mutationRoot,
            owner: `trial-${trial}-contender-${index}`,
            staleSeconds: 60,
            now: () => new Date("2026-07-10T00:02:00.000Z"),
          }),
        ),
      );
      const winners = contenders.filter((lock) => lock !== null);

      expect(winners).toHaveLength(1);
      await staleLock?.release();
      await winners[0]?.release();
    }
  }, 15_000);

  it("serializes stale replacement against the old owner's release", async () => {
    const mutationRoot = await createTempRoot();

    for (let iteration = 0; iteration < 20; iteration += 1) {
      const staleLock = await tryAcquireRawSnapshotMutationLock({
        mutationRoot,
        owner: `stale-writer-${iteration}`,
        staleSeconds: 60,
        now: () => new Date("2026-07-10T00:00:00.000Z"),
      });
      const [, replacementLock] = await Promise.all([
        staleLock?.release(),
        tryAcquireRawSnapshotMutationLock({
          mutationRoot,
          owner: `replacement-writer-${iteration}`,
          staleSeconds: 60,
          now: () => new Date("2026-07-10T00:02:00.000Z"),
        }),
      ]);

      expect(replacementLock).not.toBeNull();
      await expect(
        tryAcquireRawSnapshotMutationLock({
          mutationRoot,
          owner: `third-writer-${iteration}`,
          staleSeconds: 60,
          now: () => new Date("2026-07-10T00:02:30.000Z"),
        }),
      ).resolves.toBeNull();
      await replacementLock?.release();
    }
  });

  it("does not reclaim a fresh lock with incomplete metadata", async () => {
    const mutationRoot = await createTempRoot();
    const lockDir = join(mutationRoot, ".locks", "raw-snapshot-mutation");
    await mkdir(lockDir, { recursive: true });
    await writeFile(join(lockDir, "lock.json"), "{", "utf8");

    await expect(
      tryAcquireRawSnapshotMutationLock({ mutationRoot, owner: "second-writer" }),
    ).resolves.toBeNull();
  });

  it("reclaims an expired lock with corrupt metadata using the directory lease", async () => {
    const mutationRoot = await createTempRoot();
    const lockDir = join(mutationRoot, ".locks", "raw-snapshot-mutation");
    const expiredAt = new Date("2026-07-10T00:00:00.000Z");
    await mkdir(lockDir, { recursive: true });
    await writeFile(join(lockDir, "lock.json"), "{", "utf8");
    await utimes(lockDir, expiredAt, expiredAt);

    const replacementLock = await tryAcquireRawSnapshotMutationLock({
      mutationRoot,
      owner: "replacement-writer",
      staleSeconds: 60,
      now: () => new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(replacementLock).not.toBeNull();
    const metadata = JSON.parse(await readFile(join(lockDir, "lock.json"), "utf8")) as Record<
      string,
      unknown
    >;

    expect(metadata).toMatchObject({
      owner: "replacement-writer",
      token: expect.any(String),
      acquiredAt: "2026-07-10T00:02:00.000Z",
    });
    await replacementLock?.release();
  });

  it("rejects a lock parent symlink outside the mutation root", async () => {
    const mutationRoot = await createTempRoot();
    const outsideRoot = await createTempRoot();
    await symlink(outsideRoot, join(mutationRoot, ".locks"), "dir");

    await expect(
      tryAcquireRawSnapshotMutationLock({ mutationRoot, owner: "test-writer" }),
    ).rejects.toThrow("mutation lock parent must not be a symlink");
  });

  it("rejects a lock parent symlink to a storage child inside the mutation root", async () => {
    const mutationRoot = await createTempRoot();
    const childRoot = join(mutationRoot, "controlled-child");
    await mkdir(childRoot);
    await symlink(childRoot, join(mutationRoot, ".locks"), "dir");

    await expect(
      tryAcquireRawSnapshotMutationLock({ mutationRoot, owner: "test-writer" }),
    ).rejects.toThrow("mutation lock parent must not be a symlink");
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "partsradar-raw-snapshot-storage-"));
  tempRoots.push(root);
  return root;
}
