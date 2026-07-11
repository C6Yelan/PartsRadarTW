// apps/crawler/src/coolpc/raw-snapshot-cleanup.ts
// 清理過期 raw snapshot 中繼資料與壓縮 HTML 檔案，支援 dry-run、保留期限規則與「被其他紀錄引用」保護，避免誤刪。
import type { PrismaClient } from "@partsradar/db";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  type RawSnapshotContentStatusValue,
} from "./raw-snapshot-writer";
import {
  deleteCompressedHtmlFiles,
  preflightCompressedHtmlFiles,
  validateCompressedHtmlPaths,
} from "./raw-snapshot-cleanup/files";

// 正常與異常快照內容採用不同保存期限：異常資料保留較久，保留排障與回溯空間。
export const DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS = 30;
export const DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS = 90;

// 時間與批次常數，避免 magic number 分散於流程中。
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DELETE_CHUNK_SIZE = 500;

// 參與清理判斷的 snapshot 最小欄位集合，僅保留流程需要的資料。
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

// 保留清理流程需要的查詢與刪除委派，不讓檔案清理邏輯依賴完整 PrismaClient。
export interface RawSnapshotCleanupClient {
  rawSnapshot: {
    findMany(args: CandidateFindManyArgs): Promise<RawSnapshotCleanupCandidate[]>;
    findMany(args: CompressedPathFindManyArgs): Promise<RawSnapshotCompressedPathRef[]>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
}

// cleanupRawSnapshots 的輸入參數：保留時間、儲存路徑與 dry-run 控制。
export interface CleanupRawSnapshotsOptions {
  client: RawSnapshotCleanupClient;
  storageDir: string;
  now?: Date;
  normalRetentionDays?: number;
  abnormalRetentionDays?: number;
  dryRun?: boolean;
}

// 清理任務輸出摘要，供排程與監控紀錄實際清除規模。
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

// 對外提供 Prisma client 的最小掛接型別，避免把整個 Prisma type 外洩到流程邏輯。
export type PrismaRawSnapshotCleanupClient = Pick<PrismaClient, "rawSnapshot">;

// 將 Prisma delegate 接到清理主流程，隔離 Prisma 泛型介面與窄版清理 contract。
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

// 主清理流程：依保留期限列出候選、排除仍被引用路徑，最後依 dry-run 或實際模式刪除 metadata 與實體檔案。
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
    // dry-run 僅回報評估結果，不實際刪除 metadata / 檔案；便於排程預演與風險檢視。
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

// 定義「可刪除 snapshot」查詢條件：正常內容以 normalCutoff、異常內容以 abnormalCutoff 決定邊界並依抓取時間排序。
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

// 找出目前仍有其他 snapshot 指向的壓縮路徑，避免刪除後造成仍被使用檔案失聯。
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

// 清理參數防呆：保留天數必須是正整數，否則直接中止避免全量清除風險。
function validateRetentionDays(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

// 以現在時間往前推移天數，產生時間界線；使用複製 Date 實體避免變更外部時間參考。
function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * MS_PER_DAY);
}

// 去除重複路徑，縮減後續查詢與比對範圍。
function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

// 回傳不在保留集合中的候選路徑，即可刪除名單。
function subtractStringSet(values: string[], excluded: Set<string>): string[] {
  return values.filter((value) => !excluded.has(value));
}

// 將刪除作業切塊，避免單次 deleteMany 或後續資源處理承受過大批次。
function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
