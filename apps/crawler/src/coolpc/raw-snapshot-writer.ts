// apps/crawler/src/coolpc/raw-snapshot-writer.ts
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import type { PrismaClient } from "@partsradar/db";

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

export type PrismaRawSnapshotWriteClient = Pick<PrismaClient, "rawSnapshot">;

export function recordRawSnapshotWithPrisma(
  options: Omit<RecordRawSnapshotOptions, "client"> & {
    client: PrismaRawSnapshotWriteClient;
  },
): Promise<RecordRawSnapshotResult> {
  // Keep the storage writer dependency-injected for tests while exposing a
  // Prisma-typed entry point for the real crawler flow.
  return recordRawSnapshot(options);
}

export async function recordRawSnapshot({
  client,
  storageDir,
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
  // Raw content hash controls file deduplication. Metadata is still inserted
  // for every fetch so each crawl run remains traceable.
  const existingSnapshot = contentHash ? await findExistingSnapshot(client, contentHash) : null;
  const compressedHtmlPath =
    existingSnapshot?.compressedHtmlPath ??
    (contentHash ? createCompressedHtmlPath(contentHash) : null);
  const duplicateOfSnapshotId = existingSnapshot?.id ?? null;
  let wroteCompressedFile = false;

  // Fetch failures may have no body; in that case we only record metadata and
  // skip file creation instead of manufacturing an empty snapshot file.
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
  // Phase 3 uses this to distinguish changed vs unchanged parsed products
  // without comparing raw HTML, which can vary for layout-only reasons.
  return createSha256Hash(Buffer.from(JSON.stringify(value), "utf8"));
}

function createSha256Hash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function createCompressedHtmlPath(contentHash: string): string {
  // Content-addressed paths make duplicate detection independent of crawl time
  // and keep the stored filename free of source query details.
  return `${SNAPSHOT_SUBDIR}/${contentHash}.html.gz`;
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
  await mkdir(join(storageDir, SNAPSHOT_SUBDIR), { recursive: true });
  await writeFile(outputPath, await gzipAsync(content));
}

function toBuffer(content: RawSnapshotContent): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}
