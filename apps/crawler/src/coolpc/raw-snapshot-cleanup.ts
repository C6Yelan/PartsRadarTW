import { lstat, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  type RawSnapshotContentStatusValue,
} from "./raw-snapshot-writer";

export const DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS = 30;
export const DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DELETE_CHUNK_SIZE = 500;

export interface RawSnapshotCleanupCandidate {
  id: string;
  compressedHtmlPath: string | null;
  contentStatus: RawSnapshotContentStatusValue;
  fetchedAt: Date;
}

interface RawSnapshotCompressedPathRef {
  compressedHtmlPath: string | null;
}

type CandidateFindManyArgs = {
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
  select: {
    id: true;
    compressedHtmlPath: true;
    contentStatus: true;
    fetchedAt: true;
  };
  orderBy: { fetchedAt: "asc" };
};

type CompressedPathFindManyArgs = {
  where: {
    compressedHtmlPath: { in: string[] };
    id?: { notIn: string[] };
  };
  select: { compressedHtmlPath: true };
};

export interface RawSnapshotCleanupClient {
  rawSnapshot: {
    findMany(args: CandidateFindManyArgs): Promise<RawSnapshotCleanupCandidate[]>;
    findMany(args: CompressedPathFindManyArgs): Promise<RawSnapshotCompressedPathRef[]>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
}

export interface CleanupRawSnapshotsOptions {
  client: RawSnapshotCleanupClient;
  storageDir: string;
  now?: Date;
  normalRetentionDays?: number;
  abnormalRetentionDays?: number;
  dryRun?: boolean;
}

export interface CleanupRawSnapshotsResult {
  dryRun: boolean;
  now: Date;
  normalCutoff: Date;
  abnormalCutoff: Date;
  candidateMetadataCount: number;
  deletedMetadataCount: number;
  candidateCompressedFilePathCount: number;
  retainedCompressedFilePathCount: number;
  deletableCompressedFilePathCount: number;
  deletedCompressedFileCount: number;
  missingCompressedFileCount: number;
}

export type PrismaRawSnapshotCleanupClient = Pick<PrismaClient, "rawSnapshot">;

export function cleanupRawSnapshotsWithPrisma(
  options: Omit<CleanupRawSnapshotsOptions, "client"> & {
    client: PrismaRawSnapshotCleanupClient;
  },
): Promise<CleanupRawSnapshotsResult> {
  return cleanupRawSnapshots({
    ...options,
    client: options.client as unknown as RawSnapshotCleanupClient,
  });
}

export async function cleanupRawSnapshots({
  client,
  storageDir,
  now = new Date(),
  normalRetentionDays = DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
  abnormalRetentionDays = DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
  dryRun = true,
}: CleanupRawSnapshotsOptions): Promise<CleanupRawSnapshotsResult> {
  validateRetentionDays(normalRetentionDays, "normalRetentionDays");
  validateRetentionDays(abnormalRetentionDays, "abnormalRetentionDays");

  const normalCutoff = subtractDays(now, normalRetentionDays);
  const abnormalCutoff = subtractDays(now, abnormalRetentionDays);
  const candidates = await findCleanupCandidates(client, {
    normalCutoff,
    abnormalCutoff,
  });
  const candidateIds = candidates.map((snapshot) => snapshot.id);
  const candidateCompressedFilePaths = uniqueStrings(
    candidates
      .map((snapshot) => snapshot.compressedHtmlPath)
      .filter((path): path is string => path !== null),
  );

  validateCompressedHtmlPaths(storageDir, candidateCompressedFilePaths);

  const referencedBeforeDeletion = await findReferencedCompressedHtmlPaths(
    client,
    candidateCompressedFilePaths,
    candidateIds,
  );
  const pathsPlannedForDeletion = subtractStringSet(
    candidateCompressedFilePaths,
    referencedBeforeDeletion,
  );

  if (dryRun) {
    return {
      dryRun,
      now,
      normalCutoff,
      abnormalCutoff,
      candidateMetadataCount: candidates.length,
      deletedMetadataCount: 0,
      candidateCompressedFilePathCount: candidateCompressedFilePaths.length,
      retainedCompressedFilePathCount: referencedBeforeDeletion.size,
      deletableCompressedFilePathCount: pathsPlannedForDeletion.length,
      deletedCompressedFileCount: 0,
      missingCompressedFileCount: 0,
    };
  }

  await preflightCompressedHtmlFiles(storageDir, pathsPlannedForDeletion);

  let deletedMetadataCount = 0;

  for (const ids of chunk(candidateIds, DELETE_CHUNK_SIZE)) {
    if (ids.length === 0) {
      continue;
    }

    deletedMetadataCount += (
      await client.rawSnapshot.deleteMany({
        where: { id: { in: ids } },
      })
    ).count;
  }

  const referencedAfterDeletion = await findReferencedCompressedHtmlPaths(
    client,
    candidateCompressedFilePaths,
  );
  const filePathsToDelete = subtractStringSet(
    candidateCompressedFilePaths,
    referencedAfterDeletion,
  );
  const fileDeleteResult = await deleteCompressedHtmlFiles(storageDir, filePathsToDelete);

  return {
    dryRun,
    now,
    normalCutoff,
    abnormalCutoff,
    candidateMetadataCount: candidates.length,
    deletedMetadataCount,
    candidateCompressedFilePathCount: candidateCompressedFilePaths.length,
    retainedCompressedFilePathCount: referencedAfterDeletion.size,
    deletableCompressedFilePathCount: filePathsToDelete.length,
    deletedCompressedFileCount: fileDeleteResult.deleted,
    missingCompressedFileCount: fileDeleteResult.missing,
  };
}

async function findCleanupCandidates(
  client: RawSnapshotCleanupClient,
  {
    normalCutoff,
    abnormalCutoff,
  }: {
    normalCutoff: Date;
    abnormalCutoff: Date;
  },
): Promise<RawSnapshotCleanupCandidate[]> {
  return client.rawSnapshot.findMany({
    where: {
      OR: [
        {
          contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
          fetchedAt: { lt: normalCutoff },
        },
        {
          contentStatus: {
            in: [
              RAW_SNAPSHOT_CONTENT_STATUSES.INVALID,
              RAW_SNAPSHOT_CONTENT_STATUSES.SUSPECTED_BLOCK,
            ],
          },
          fetchedAt: { lt: abnormalCutoff },
        },
      ],
    },
    select: {
      id: true,
      compressedHtmlPath: true,
      contentStatus: true,
      fetchedAt: true,
    },
    orderBy: { fetchedAt: "asc" },
  });
}

async function findReferencedCompressedHtmlPaths(
  client: RawSnapshotCleanupClient,
  compressedHtmlPaths: string[],
  excludedIds: string[] = [],
): Promise<Set<string>> {
  if (compressedHtmlPaths.length === 0) {
    return new Set();
  }

  const where: CompressedPathFindManyArgs["where"] = {
    compressedHtmlPath: { in: compressedHtmlPaths },
  };

  if (excludedIds.length > 0) {
    where.id = { notIn: excludedIds };
  }

  const rows = await client.rawSnapshot.findMany({
    where,
    select: { compressedHtmlPath: true },
  });

  return new Set(
    rows.map((row) => row.compressedHtmlPath).filter((path): path is string => path !== null),
  );
}

async function deleteCompressedHtmlFiles(
  storageDir: string,
  compressedHtmlPaths: string[],
): Promise<{ deleted: number; missing: number }> {
  let deleted = 0;
  let missing = 0;

  for (const relativePath of compressedHtmlPaths) {
    try {
      await unlink(resolveCompressedHtmlPath(storageDir, relativePath));
      deleted += 1;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        missing += 1;
        continue;
      }

      throw error;
    }
  }

  return { deleted, missing };
}

async function preflightCompressedHtmlFiles(
  storageDir: string,
  compressedHtmlPaths: string[],
): Promise<void> {
  for (const relativePath of compressedHtmlPaths) {
    const outputPath = resolveCompressedHtmlPath(storageDir, relativePath);

    try {
      const stats = await lstat(outputPath);

      if (!stats.isFile()) {
        throw new Error(
          `Refusing to delete raw snapshot path because it is not a regular file: ${relativePath}`,
        );
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }
}

function validateRetentionDays(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function validateCompressedHtmlPaths(storageDir: string, compressedHtmlPaths: string[]): void {
  for (const relativePath of compressedHtmlPaths) {
    resolveCompressedHtmlPath(storageDir, relativePath);
  }
}

function resolveCompressedHtmlPath(storageDir: string, relativePath: string): string {
  if (!relativePath) {
    throw new Error("Raw snapshot compressed_html_path must not be empty.");
  }

  if (isAbsolute(relativePath)) {
    throw new Error(`Refusing to delete absolute raw snapshot path: ${relativePath}`);
  }

  const root = resolve(storageDir);
  const outputPath = resolve(root, relativePath);
  const relativeOutputPath = relative(root, outputPath);

  if (relativeOutputPath === "") {
    throw new Error(`Refusing to delete raw snapshot storage root: ${relativePath}`);
  }

  if (relativeOutputPath.startsWith("..") || isAbsolute(relativeOutputPath)) {
    throw new Error(`Refusing to delete raw snapshot path outside storage dir: ${relativePath}`);
  }

  return outputPath;
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * MS_PER_DAY);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function subtractStringSet(values: string[], excluded: Set<string>): string[] {
  return values.filter((value) => !excluded.has(value));
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
