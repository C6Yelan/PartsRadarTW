import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  createParsedResultHash,
  recordRawSnapshot,
  type RawSnapshotContentStatusValue,
  type RawSnapshotWriteClient,
} from "./raw-snapshot";

const gunzipAsync = promisify(gunzip);

describe("CoolPC raw snapshot writer", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("writes gzip HTML and raw snapshot metadata for valid content", async () => {
    const client = new FakeRawSnapshotWriteClient();
    const storageDir = await createTempDir(tempDirs);
    const rawHtml = "<html><title>原價屋處理器CPU總覽</title></html>";

    const result = await recordRawSnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      sourceCategoryId: "category-4",
      url: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
      httpStatus: 200,
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
      rawContent: rawHtml,
      parsedResultHash: createParsedResultHash([{ token: "CPU-TOKEN-001", price: 4880 }]),
    });

    expect(result).toMatchObject({
      id: "raw-snapshot-1",
      compressedHtmlPath: expect.stringMatching(/^coolpc\/[a-f0-9]{64}\.html\.gz$/),
      duplicateOfSnapshotId: null,
      wroteCompressedFile: true,
    });
    expect(client.rawSnapshots[0]).toMatchObject({
      crawlRunId: "crawl-run-1",
      sourceCategoryId: "category-4",
      httpStatus: 200,
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
      contentHash: result.contentHash,
      compressedHtmlPath: result.compressedHtmlPath,
      duplicateOfSnapshotId: null,
    });

    const compressed = await readFile(join(storageDir, result.compressedHtmlPath ?? ""));
    expect((await gunzipAsync(compressed)).toString("utf8")).toBe(rawHtml);
  });

  it("deduplicates gzip files by raw content hash while keeping new metadata", async () => {
    const client = new FakeRawSnapshotWriteClient();
    const storageDir = await createTempDir(tempDirs);
    const rawHtml = "<html><body>same source content</body></html>";

    const first = await recordRawSnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      sourceCategoryId: "category-4",
      url: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
      httpStatus: 200,
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
      rawContent: rawHtml,
    });
    const second = await recordRawSnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-2",
      sourceCategoryId: "category-4",
      url: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
      fetchedAt: new Date("2026-05-27T11:05:00.000Z"),
      httpStatus: 200,
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
      rawContent: rawHtml,
    });

    expect(second).toMatchObject({
      contentHash: first.contentHash,
      compressedHtmlPath: first.compressedHtmlPath,
      duplicateOfSnapshotId: first.id,
      wroteCompressedFile: false,
    });
    expect(client.rawSnapshots).toHaveLength(2);
    expect(await readdir(join(storageDir, "coolpc"))).toHaveLength(1);
  });

  it("records invalid and suspected block snapshots without treating them as product data", async () => {
    const client = new FakeRawSnapshotWriteClient();
    const storageDir = await createTempDir(tempDirs);

    const invalid = await recordRawSnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      sourceCategoryId: "category-4",
      url: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
      httpStatus: 200,
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.INVALID,
      rawContent: "<html><title>原價屋處理器CPU總覽</title></html>",
    });
    const suspectedBlock = await recordRawSnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      sourceCategoryId: "category-5",
      url: "https://www.coolpc.com.tw/eachview.php?IGrp=5",
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
      httpStatus: 200,
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.SUSPECTED_BLOCK,
      rawContent: "<html><title>unexpected response</title></html>",
    });

    expect(invalid.wroteCompressedFile).toBe(true);
    expect(suspectedBlock.wroteCompressedFile).toBe(true);
    expect(client.rawSnapshots.map((snapshot) => snapshot.contentStatus)).toEqual([
      RAW_SNAPSHOT_CONTENT_STATUSES.INVALID,
      RAW_SNAPSHOT_CONTENT_STATUSES.SUSPECTED_BLOCK,
    ]);
  });

  it("records fetch errors without raw content or a compressed file", async () => {
    const client = new FakeRawSnapshotWriteClient();
    const storageDir = await createTempDir(tempDirs);

    const result = await recordRawSnapshot({
      client,
      storageDir,
      crawlRunId: "crawl-run-1",
      sourceCategoryId: "category-4",
      url: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
      fetchError: "Fetch timed out.",
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.INVALID,
    });

    expect(result).toEqual({
      id: "raw-snapshot-1",
      contentHash: null,
      compressedHtmlPath: null,
      duplicateOfSnapshotId: null,
      wroteCompressedFile: false,
    });
    expect(client.rawSnapshots[0]).toMatchObject({
      fetchError: "Fetch timed out.",
      contentHash: null,
      compressedHtmlPath: null,
    });
  });

  it("creates stable parsed result hashes", () => {
    const parsedItems = [{ sourceItemKey: "coolpc:igrp:4:ibuy:CPU-TOKEN-001", price: 4880 }];

    expect(createParsedResultHash(parsedItems)).toBe(createParsedResultHash(parsedItems));
    expect(createParsedResultHash(parsedItems)).not.toBe(
      createParsedResultHash([{ sourceItemKey: "coolpc:igrp:4:ibuy:CPU-TOKEN-001", price: 4990 }]),
    );
  });
});

interface FakeRawSnapshot {
  id: string;
  crawlRunId: string;
  sourceCategoryId: string;
  url: string;
  fetchedAt: Date;
  httpStatus: number | null;
  fetchError: string | null;
  contentStatus: RawSnapshotContentStatusValue;
  contentHash: string | null;
  parsedResultHash: string | null;
  compressedHtmlPath: string | null;
  duplicateOfSnapshotId: string | null;
  createdAt: Date;
}

class FakeRawSnapshotWriteClient implements RawSnapshotWriteClient {
  readonly rawSnapshots: FakeRawSnapshot[] = [];

  rawSnapshot = {
    // The fake mirrors the production dedupe query closely enough to prove that
    // a second fetch creates metadata but reuses the first compressed file.
    findFirst: async ({
      where,
    }: Parameters<RawSnapshotWriteClient["rawSnapshot"]["findFirst"]>[0]) =>
      this.rawSnapshots.find(
        (snapshot) =>
          snapshot.contentHash === where.contentHash &&
          snapshot.compressedHtmlPath !== null &&
          snapshot.duplicateOfSnapshotId === null,
      ) ?? null,
    create: async ({ data }: Parameters<RawSnapshotWriteClient["rawSnapshot"]["create"]>[0]) => {
      const snapshot: FakeRawSnapshot = {
        id: `raw-snapshot-${this.rawSnapshots.length + 1}`,
        crawlRunId: data.crawlRunId,
        sourceCategoryId: data.sourceCategoryId,
        url: data.url,
        fetchedAt: data.fetchedAt,
        httpStatus: data.httpStatus ?? null,
        fetchError: data.fetchError ?? null,
        contentStatus: data.contentStatus,
        contentHash: data.contentHash ?? null,
        parsedResultHash: data.parsedResultHash ?? null,
        compressedHtmlPath: data.compressedHtmlPath ?? null,
        duplicateOfSnapshotId: data.duplicateOfSnapshotId ?? null,
        createdAt: new Date("2026-05-27T11:00:00.000Z"),
      };
      this.rawSnapshots.push(snapshot);

      return { id: snapshot.id };
    },
  };
}

async function createTempDir(tempDirs: string[]): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "partsradar-raw-snapshot-"));
  tempDirs.push(tempDir);
  return tempDir;
}
