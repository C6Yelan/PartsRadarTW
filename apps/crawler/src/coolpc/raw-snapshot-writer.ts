// apps/crawler/src/coolpc/raw-snapshot-writer.ts
// 提供 Coolpc raw snapshot 的壓縮內容存檔與去重流程，包含快取查詢、雜湊產生與寫入結果回報。

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

const gzipAsync = promisify(gzip);
const SNAPSHOT_SUBDIR = "coolpc";

export const RAW_SNAPSHOT_CONTENT_STATUSES = {
  VALID: "VALID",
  SUSPECTED_BLOCK: "SUSPECTED_BLOCK",
  INVALID: "INVALID",
} as const;

export type RawSnapshotContentStatusValue =
  (typeof RAW_SNAPSHOT_CONTENT_STATUSES)[keyof typeof RAW_SNAPSHOT_CONTENT_STATUSES];

export type RawSnapshotContent = string | Buffer | Uint8Array;

export interface ExistingRawSnapshot {
  id: string;
  compressedHtmlPath: string | null;
}

export interface CreatedRawSnapshot {
  id: string;
}

export interface RawSnapshotWriteClient {
  rawSnapshot: {
    findFirst(args: {
      where: {
        contentHash: string;
        compressedHtmlPath: { not: null };
        duplicateOfSnapshotId: null;
      };
      orderBy: { createdAt: "asc" };
    }): Promise<ExistingRawSnapshot | null>;
    create(args: {
      data: {
        crawlRunId: string;
        sourceCategoryId: string;
        url: string;
        fetchedAt: Date;
        httpStatus?: number | null;
        fetchError?: string | null;
        contentStatus: RawSnapshotContentStatusValue;
        contentHash?: string | null;
        parsedResultHash?: string | null;
        compressedHtmlPath?: string | null;
        duplicateOfSnapshotId?: string | null;
      };
    }): Promise<CreatedRawSnapshot>;
  };
}

export interface RecordRawSnapshotOptions {
  client: RawSnapshotWriteClient;
  storageDir: string;
  storagePathPrefix?: string;
  crawlRunId: string;
  sourceCategoryId: string;
  url: string;
  fetchedAt: Date;
  httpStatus?: number | null;
  fetchError?: string | null;
  contentStatus: RawSnapshotContentStatusValue;
  rawContent?: RawSnapshotContent | null;
  parsedResultHash?: string | null;
}

export interface RecordRawSnapshotResult {
  id: string;
  contentHash: string | null;
  compressedHtmlPath: string | null;
  duplicateOfSnapshotId: string | null;
  wroteCompressedFile: boolean;
}

export async function recordRawSnapshot({
  client,
  storageDir,
  storagePathPrefix = "",
  crawlRunId,
  sourceCategoryId,
  url,
  fetchedAt,
  httpStatus = null,
  fetchError = null,
  contentStatus,
  rawContent = null,
  parsedResultHash = null,
}: RecordRawSnapshotOptions): Promise<RecordRawSnapshotResult> {
  const contentBuffer = rawContent === null ? null : toBuffer(rawContent);
  const contentHash = contentBuffer ? createSha256Hash(contentBuffer) : null;
  // 以 content hash 進行快照去重；不論是否重複，都記錄一筆 metadata 以保留每次抓取可追溯性。
  const existingSnapshot = contentHash ? await findExistingSnapshot(client, contentHash) : null;
  const compressedHtmlPath =
    existingSnapshot?.compressedHtmlPath ??
    (contentHash ? createCompressedHtmlPath(contentHash, storagePathPrefix) : null);
  const duplicateOfSnapshotId = existingSnapshot?.id ?? null;
  let wroteCompressedFile = false;

  // 失敗回應常無抓取本文，這裡僅寫入 metadata，不建立空白快照檔，避免污染資料。
  if (contentBuffer && !existingSnapshot && compressedHtmlPath) {
    await writeCompressedHtml({
      storageDir,
      relativePath: compressedHtmlPath,
      content: contentBuffer,
    });
    wroteCompressedFile = true;
  }

  const snapshot = await client.rawSnapshot.create({
    data: {
      crawlRunId,
      sourceCategoryId,
      url,
      fetchedAt,
      httpStatus,
      fetchError,
      contentStatus,
      contentHash,
      parsedResultHash,
      compressedHtmlPath,
      duplicateOfSnapshotId,
    },
  });

  return {
    id: snapshot.id,
    contentHash,
    compressedHtmlPath,
    duplicateOfSnapshotId,
    wroteCompressedFile,
  };
}

export function createParsedResultHash(value: unknown): string {
  // 以 JSON 序列化後的內容雜湊判斷解析結果是否變更，避免因頁面版面變化造成的重複比對誤判。
  return createSha256Hash(Buffer.from(JSON.stringify(value), "utf8"));
}

function createSha256Hash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function createCompressedHtmlPath(contentHash: string, storagePathPrefix: string): string {
  // 以 content hash 決定儲存路徑，避免同一內容因抓取時間或 query 參數不同而重複落地。
  const normalizedPrefix = posix.normalize(storagePathPrefix.replaceAll("\\", "/"));

  if (
    posix.isAbsolute(normalizedPrefix) ||
    normalizedPrefix === ".." ||
    normalizedPrefix.startsWith("../")
  ) {
    throw new Error("Raw snapshot storage path prefix must stay within its mutation root.");
  }

  return posix.join(
    normalizedPrefix === "." ? "" : normalizedPrefix,
    SNAPSHOT_SUBDIR,
    `${contentHash}.html.gz`,
  );
}

async function findExistingSnapshot(
  client: RawSnapshotWriteClient,
  contentHash: string,
): Promise<ExistingRawSnapshot | null> {
  return client.rawSnapshot.findFirst({
    where: {
      contentHash,
      compressedHtmlPath: { not: null },
      duplicateOfSnapshotId: null,
    },
    orderBy: { createdAt: "asc" },
  });
}

async function writeCompressedHtml({
  storageDir,
  relativePath,
  content,
}: {
  storageDir: string;
  relativePath: string;
  content: Buffer;
}): Promise<void> {
  const outputPath = join(storageDir, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await gzipAsync(content));
}

function toBuffer(content: RawSnapshotContent): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}
