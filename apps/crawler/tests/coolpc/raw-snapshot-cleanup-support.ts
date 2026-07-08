// apps/crawler/tests/coolpc/raw-snapshot-cleanup-support.ts
// 提供 raw snapshot cleanup 測試用的假 client、暫存檔案建立與路徑存在性檢查 helper。

import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  RawSnapshotCleanupCandidate,
  RawSnapshotCleanupClient,
} from "../../src/coolpc/raw-snapshot-cleanup";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  type RawSnapshotContentStatusValue,
} from "../../src/coolpc/raw-snapshot-writer";

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

export class FakeRawSnapshotCleanupClient implements RawSnapshotCleanupClient {
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

export function snapshot(
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

export async function createTempDir(tempDirs: string[]): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "partsradar-raw-retention-"));
  tempDirs.push(tempDir);
  return tempDir;
}

export async function writeSnapshotFile(storageDir: string, relativePath: string): Promise<void> {
  const outputPath = join(storageDir, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, "compressed html placeholder");
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
