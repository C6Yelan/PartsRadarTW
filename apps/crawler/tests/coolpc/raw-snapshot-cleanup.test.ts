// apps/crawler/tests/coolpc/raw-snapshot-cleanup.test.ts
// 驗證 raw snapshot cleanup 的 dry-run、實際刪除、引用保留與危險路徑防護。

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupRawSnapshots } from "../../src/coolpc/raw-snapshot-cleanup";
import {
  createTempDir,
  FakeRawSnapshotCleanupClient,
  pathExists,
  snapshot,
  writeSnapshotFile,
} from "./raw-snapshot-cleanup-support";

const NOW = new Date("2026-05-31T00:00:00.000Z");

describe("raw snapshot cleanup", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("dry-runs expired metadata and leaves rows and files untouched", async () => {
    const storageDir = await createTempDir(tempDirs);
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", "coolpc/old-valid.html.gz"),
      snapshot("new-valid", "VALID", "2026-05-20T00:00:00.000Z", "coolpc/new-valid.html.gz"),
      snapshot("old-invalid", "INVALID", "2026-01-01T00:00:00.000Z", "coolpc/old-invalid.html.gz"),
    ]);
    await writeSnapshotFile(storageDir, "coolpc/old-valid.html.gz");
    await writeSnapshotFile(storageDir, "coolpc/old-invalid.html.gz");

    const result = await cleanupRawSnapshots({
      client,
      storageDir,
      now: NOW,
    });

    expect(result).toMatchObject({
      dryRun: true,
      candidateMetadataCount: 2,
      deletedMetadataCount: 0,
      candidateCompressedFilePathCount: 2,
      deletableCompressedFilePathCount: 2,
      deletedCompressedFileCount: 0,
    });
    expect(client.rawSnapshots.map((row) => row.id)).toEqual([
      "old-valid",
      "new-valid",
      "old-invalid",
    ]);
    await expect(pathExists(join(storageDir, "coolpc/old-valid.html.gz"))).resolves.toBe(true);
  });

  it("deletes expired metadata and unreferenced compressed files", async () => {
    const storageDir = await createTempDir(tempDirs);
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", "coolpc/old-valid.html.gz"),
      snapshot("new-valid", "VALID", "2026-05-20T00:00:00.000Z", "coolpc/new-valid.html.gz"),
      snapshot("old-invalid", "INVALID", "2026-01-01T00:00:00.000Z", "coolpc/old-invalid.html.gz"),
      snapshot("new-invalid", "INVALID", "2026-04-01T00:00:00.000Z", "coolpc/new-invalid.html.gz"),
    ]);
    await writeSnapshotFile(storageDir, "coolpc/old-valid.html.gz");
    await writeSnapshotFile(storageDir, "coolpc/new-valid.html.gz");
    await writeSnapshotFile(storageDir, "coolpc/old-invalid.html.gz");
    await writeSnapshotFile(storageDir, "coolpc/new-invalid.html.gz");

    const result = await cleanupRawSnapshots({
      client,
      storageDir,
      now: NOW,
      dryRun: false,
    });

    expect(result).toMatchObject({
      candidateMetadataCount: 2,
      deletedMetadataCount: 2,
      candidateCompressedFilePathCount: 2,
      retainedCompressedFilePathCount: 0,
      deletableCompressedFilePathCount: 2,
      deletedCompressedFileCount: 2,
    });
    expect(client.rawSnapshots.map((row) => row.id)).toEqual(["new-valid", "new-invalid"]);
    await expect(pathExists(join(storageDir, "coolpc/old-valid.html.gz"))).resolves.toBe(false);
    await expect(pathExists(join(storageDir, "coolpc/old-invalid.html.gz"))).resolves.toBe(false);
    await expect(pathExists(join(storageDir, "coolpc/new-valid.html.gz"))).resolves.toBe(true);
    await expect(pathExists(join(storageDir, "coolpc/new-invalid.html.gz"))).resolves.toBe(true);
  });

  it("keeps compressed files still referenced by retained metadata", async () => {
    const storageDir = await createTempDir(tempDirs);
    const sharedPath = "coolpc/shared.html.gz";
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", sharedPath),
      snapshot("new-valid", "VALID", "2026-05-20T00:00:00.000Z", sharedPath),
    ]);
    await writeSnapshotFile(storageDir, sharedPath);

    const result = await cleanupRawSnapshots({
      client,
      storageDir,
      now: NOW,
      dryRun: false,
    });

    expect(result).toMatchObject({
      deletedMetadataCount: 1,
      retainedCompressedFilePathCount: 1,
      deletableCompressedFilePathCount: 0,
      deletedCompressedFileCount: 0,
    });
    expect(client.rawSnapshots.map((row) => row.id)).toEqual(["new-valid"]);
    await expect(pathExists(join(storageDir, sharedPath))).resolves.toBe(true);
  });

  it("refuses to delete the storage root through dot paths and keeps metadata", async () => {
    const storageDir = await createTempDir(tempDirs);
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", "."),
    ]);

    await expect(
      cleanupRawSnapshots({
        client,
        storageDir,
        now: NOW,
        dryRun: false,
      }),
    ).rejects.toThrow("Refusing to delete raw snapshot storage root");
    expect(client.rawSnapshots.map((row) => row.id)).toEqual(["old-valid"]);
  });

  it("refuses to delete the storage root through normalized subpaths and keeps metadata", async () => {
    const storageDir = await createTempDir(tempDirs);
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", "coolpc/.."),
    ]);

    await expect(
      cleanupRawSnapshots({
        client,
        storageDir,
        now: NOW,
        dryRun: false,
      }),
    ).rejects.toThrow("Refusing to delete raw snapshot storage root");
    expect(client.rawSnapshots.map((row) => row.id)).toEqual(["old-valid"]);
  });

  it("refuses absolute compressed paths and keeps metadata", async () => {
    const storageDir = await createTempDir(tempDirs);
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", join(storageDir, "file.html.gz")),
    ]);

    await expect(
      cleanupRawSnapshots({
        client,
        storageDir,
        now: NOW,
        dryRun: false,
      }),
    ).rejects.toThrow("absolute raw snapshot path");
    expect(client.rawSnapshots.map((row) => row.id)).toEqual(["old-valid"]);
  });

  it("refuses to delete compressed paths outside the storage directory", async () => {
    const storageDir = await createTempDir(tempDirs);
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", "../outside.html.gz"),
    ]);

    await expect(
      cleanupRawSnapshots({
        client,
        storageDir,
        now: NOW,
        dryRun: false,
      }),
    ).rejects.toThrow("outside storage dir");
    expect(client.rawSnapshots.map((row) => row.id)).toEqual(["old-valid"]);
  });

  it("fails the whole cleanup before deleting safe files when any candidate path is dangerous", async () => {
    const storageDir = await createTempDir(tempDirs);
    const safePath = "coolpc/safe.html.gz";
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-safe", "VALID", "2026-04-01T00:00:00.000Z", safePath),
      snapshot("old-dangerous", "VALID", "2026-04-01T00:00:00.000Z", "."),
    ]);
    await writeSnapshotFile(storageDir, safePath);

    await expect(
      cleanupRawSnapshots({
        client,
        storageDir,
        now: NOW,
        dryRun: false,
      }),
    ).rejects.toThrow("Refusing to delete raw snapshot storage root");
    expect(client.rawSnapshots.map((row) => row.id)).toEqual(["old-safe", "old-dangerous"]);
    await expect(pathExists(join(storageDir, safePath))).resolves.toBe(true);
  });

  it("deletes expired metadata when the compressed file is already missing", async () => {
    const storageDir = await createTempDir(tempDirs);
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", "coolpc/missing.html.gz"),
    ]);

    const result = await cleanupRawSnapshots({
      client,
      storageDir,
      now: NOW,
      dryRun: false,
    });

    expect(result).toMatchObject({
      deletedMetadataCount: 1,
      deletedCompressedFileCount: 0,
      missingCompressedFileCount: 1,
    });
    expect(client.rawSnapshots).toHaveLength(0);
  });

  it("rejects directory compressed paths before deleting metadata", async () => {
    const storageDir = await createTempDir(tempDirs);
    const directoryPath = "coolpc/directory.html.gz";
    const client = new FakeRawSnapshotCleanupClient([
      snapshot("old-valid", "VALID", "2026-04-01T00:00:00.000Z", directoryPath),
    ]);
    await mkdir(join(storageDir, directoryPath), { recursive: true });

    await expect(
      cleanupRawSnapshots({
        client,
        storageDir,
        now: NOW,
        dryRun: false,
      }),
    ).rejects.toThrow("not a regular file");
    expect(client.rawSnapshots.map((row) => row.id)).toEqual(["old-valid"]);
    await expect(pathExists(join(storageDir, directoryPath))).resolves.toBe(true);
  });
});
