// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-processor.support.ts
// 提供圖片快取補圖 processor 測試共用的候選、選項與暫存目錄 helpers。

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImageBackfillOptions } from "../../../../src/scripts/ops/image-cache-backfill/options";
import type { ProductImageCandidate } from "../../../../src/scripts/ops/image-cache-backfill/processor";

export function createCandidate(id: string, seenAt: string): ProductImageCandidate {
  const date = new Date(seenAt);

  return {
    id,
    name: id,
    isActive: true,
    primaryImageUrl: `https://www.coolpc.com.tw/eval/4/${id}.jpg`,
    primaryImageCheckedAt: date,
    imageCachedAt: null,
    imageCacheCheckedAt: null,
    imageCacheFailureCount: 0,
    imageCacheFailureSince: null,
    imageCacheNextRetryAt: null,
    firstSeenAt: date,
    lastSeenAt: date,
    priceSnapshots: [{ capturedAt: date }],
    sourceCategory: {
      igrp: 4,
      displayName: "CPU",
    },
  };
}

export function createOptions(
  overrides: Partial<ImageBackfillOptions> = {},
): ImageBackfillOptions {
  const storageDir = overrides.storageDir ?? "/workspace/storage/product-images";

  return {
    workspaceRoot: "/workspace",
    storageDir,
    limit: null,
    productId: null,
    igrp: null,
    inactiveRetentionDays: 30,
    minDelayMs: 3000,
    maxDelayMs: 8000,
    timeoutMs: 15000,
    maxSourceBytes: 5 * 1024 * 1024,
    sourceImageFetchLockDir: join(storageDir, ".locks", "source-image-fetch"),
    sourceImageFetchLockStaleSeconds: 43200,
    dryRun: false,
    overwrite: false,
    ...overrides,
  };
}

export async function createTempRoot(tempRoots: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "partsradar-image-cache-backfill-"));
  tempRoots.push(root);

  return root;
}

export async function cleanupTempRoots(tempRoots: string[]): Promise<void> {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
}
