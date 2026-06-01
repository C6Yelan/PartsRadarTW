import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type RawSnapshotCleanupCandidate,
  type RawSnapshotCleanupClient,
  cleanupRawSnapshots,
} from "../../src/coolpc/raw-snapshot-cleanup";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  type RawSnapshotContentStatusValue,
} from "../../src/coolpc/raw-snapshot-writer";

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

interface FakeRawSnapshot extends RawSnapshotCleanupCandidate {}

type FakeCandidateFindManyArgs = {
  where: {
    OR: Array<
      | {
          contentStatus: typeof RAW_SNAPSHOT_CONTENT_STATUSES.VALID;
          fetchedAt: { lt: Date };
        }
      | {
          contentStatus: {
            in: Array<
              | typeof RAW_SNAPSHOT_CONTENT_STATUSES.INVALID
              | typeof RAW_SNAPSHOT_CONTENT_STATUSES.SUSPECTED_BLOCK
            >;
          };
          fetchedAt: { lt: Date };
        }
    >;
  };
};

type FakeCompressedPathFindManyArgs = {
  where: {
    compressedHtmlPath: { in: string[] };
    id?: { notIn: string[] };
  };
};

type FakeFindManyArgs = FakeCandidateFindManyArgs | FakeCompressedPathFindManyArgs;

function isFakeCandidateQuery(query: FakeFindManyArgs): query is FakeCandidateFindManyArgs {
  return "OR" in query.where;
}

function isFakeCompressedPathQuery(
  query: FakeFindManyArgs,
): query is FakeCompressedPathFindManyArgs {
  return "compressedHtmlPath" in query.where;
}

class FakeRawSnapshotCleanupClient implements RawSnapshotCleanupClient {
  rawSnapshots: FakeRawSnapshot[];

  constructor(rawSnapshots: FakeRawSnapshot[]) {
    this.rawSnapshots = rawSnapshots;
  }

  rawSnapshot = {
    findMany: (async (args: unknown) => {
      const query = args as FakeFindManyArgs;

      if (isFakeCandidateQuery(query)) {
        return this.findCleanupCandidates(query);
      }

      if (!isFakeCompressedPathQuery(query)) {
        throw new Error("Unsupported fake raw snapshot query.");
      }

      return this.findCompressedPathRefs(query);
    }) as RawSnapshotCleanupClient["rawSnapshot"]["findMany"],
    deleteMany: async ({
      where,
    }: Parameters<RawSnapshotCleanupClient["rawSnapshot"]["deleteMany"]>[0]) => {
      const ids = new Set(where.id.in);
      const beforeCount = this.rawSnapshots.length;
      this.rawSnapshots = this.rawSnapshots.filter((snapshot) => !ids.has(snapshot.id));

      return {
        count: beforeCount - this.rawSnapshots.length,
      };
    },
  };

  private findCleanupCandidates(query: FakeCandidateFindManyArgs) {
    const [normalRule, abnormalRule] = query.where.OR;
    const normalCutoff = "fetchedAt" in normalRule ? normalRule.fetchedAt.lt : new Date(Number.NaN);
    const abnormalCutoff =
      "fetchedAt" in abnormalRule ? abnormalRule.fetchedAt.lt : new Date(Number.NaN);

    return this.rawSnapshots
      .filter(
        (snapshot) =>
          (snapshot.contentStatus === RAW_SNAPSHOT_CONTENT_STATUSES.VALID &&
            snapshot.fetchedAt < normalCutoff) ||
          (snapshot.contentStatus !== RAW_SNAPSHOT_CONTENT_STATUSES.VALID &&
            snapshot.fetchedAt < abnormalCutoff),
      )
      .sort((left, right) => left.fetchedAt.getTime() - right.fetchedAt.getTime());
  }

  private findCompressedPathRefs(query: FakeCompressedPathFindManyArgs) {
    const paths = new Set(query.where.compressedHtmlPath.in);
    const excludedIds = new Set(query.where.id?.notIn ?? []);

    return this.rawSnapshots
      .filter(
        (snapshot) =>
          snapshot.compressedHtmlPath !== null &&
          paths.has(snapshot.compressedHtmlPath) &&
          !excludedIds.has(snapshot.id),
      )
      .map((snapshot) => ({
        compressedHtmlPath: snapshot.compressedHtmlPath,
      }));
  }
}

function snapshot(
  id: string,
  contentStatus: RawSnapshotContentStatusValue,
  fetchedAt: string,
  compressedHtmlPath: string | null,
): FakeRawSnapshot {
  return {
    id,
    contentStatus,
    fetchedAt: new Date(fetchedAt),
    compressedHtmlPath,
  };
}

async function createTempDir(tempDirs: string[]): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "partsradar-raw-retention-"));
  tempDirs.push(tempDir);
  return tempDir;
}

async function writeSnapshotFile(storageDir: string, relativePath: string): Promise<void> {
  const outputPath = join(storageDir, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, "compressed html placeholder");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
