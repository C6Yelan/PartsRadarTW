// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-processor.test.ts
// 驗證圖片快取補圖的 dry-run log、錯誤計數、重用與摘要行為。

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageBackfillOptions } from "../../../../src/scripts/ops/image-cache-backfill/options";
import {
  backfillImages,
  type ProductImageCandidate,
} from "../../../../src/scripts/ops/image-cache-backfill/processor";
import { tryAcquireExternalFetchLock } from "../../../../src/scripts/ops/external-fetch-lock";

const tempRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("image cache backfill log levels", () => {
  it("keeps dry-run candidate details behind debug logging", async () => {
    const infoLines: string[] = [];
    const debugLines: string[] = [];

    const summary = await backfillImages(
      [createCandidate("dry-run-image", "2026-06-08T08:05:00.000Z")],
      createOptions({ dryRun: true }),
      {
        log: (message) => infoLines.push(message),
        debugLog: (message) => debugLines.push(message),
      },
    );

    expect(summary).toMatchObject({ selected: 1, dryRun: 1 });
    expect(infoLines).toEqual([
      "Selected 1 product image candidate(s).",
      "Output directory: storage/product-images",
      "Mode: dry run; no source requests will be sent.",
      "Duplicate source image URLs are downloaded once and reused locally.",
    ]);
    expect(debugLines).toEqual([
      "[dry-run] dry-run-image | CPU IGrp=4 | https://www.coolpc.com.tw/eval/4/dry-run-image.jpg -> storage/product-images/dry-run-image.webp",
    ]);
  });

  it("keeps invalid image candidates visible in normal logs", async () => {
    const infoLines: string[] = [];
    const debugLines: string[] = [];

    const summary = await backfillImages(
      [
        {
          ...createCandidate("missing-url", "2026-06-08T08:05:00.000Z"),
          primaryImageUrl: null,
        },
      ],
      createOptions({ dryRun: true }),
      {
        log: (message) => infoLines.push(message),
        debugLog: (message) => debugLines.push(message),
      },
    );

    expect(summary).toMatchObject({ selected: 1, invalid: 1 });
    expect(infoLines).toContain("[invalid] missing-url | missing image URL | missing-url");
    expect(debugLines).toEqual([]);
  });
});

describe("image cache backfill live request accounting", () => {
  it("does not count a shared-lock deferral as a source request", async () => {
    const storageDir = await createTempRoot();
    const options = createOptions({ storageDir });
    const fetchMock = vi.fn();
    const existingLock = await tryAcquireExternalFetchLock({
      lockDir: options.externalFetchLockDir,
      owner: "scheduled-crawler",
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await backfillImages(
      [createCandidate("lock-deferred", "2026-06-08T08:05:00.000Z")],
      options,
      { log: () => {}, debugLog: () => {} },
    );

    expect(summary).toMatchObject({ failed: 1, liveFetches: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    await existingLock?.release();
  });

  it("does not count a failed local thumbnail reuse as a source request", async () => {
    const storageDir = await createTempRoot();
    const sourceCandidate = createCandidate("reusable-source", "2026-06-08T08:05:00.000Z");
    const reuseCandidate = {
      ...createCandidate("reuse-target", "2026-06-08T08:04:00.000Z"),
      primaryImageUrl: sourceCandidate.primaryImageUrl,
    };
    const fetchMock = vi.fn();
    await mkdir(join(storageDir, "reusable-source.webp"));
    vi.stubGlobal("fetch", fetchMock);

    const summary = await backfillImages(
      [sourceCandidate, reuseCandidate],
      createOptions({ storageDir }),
      { log: () => {}, debugLog: () => {} },
    );

    expect(summary).toMatchObject({ skipped: 1, failed: 1, liveFetches: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts rejected fetches and releases the source lock between requests", async () => {
    const storageDir = await createTempRoot();
    const fetchMock = vi.fn(async () => {
      throw new Error("source unavailable");
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await backfillImages(
      [
        createCandidate("fetch-failure-one", "2026-06-08T08:05:00.000Z"),
        createCandidate("fetch-failure-two", "2026-06-08T08:04:00.000Z"),
      ],
      createOptions({ storageDir, minDelayMs: 0, maxDelayMs: 0 }),
      { log: () => {}, debugLog: () => {} },
    );

    expect(summary).toMatchObject({ failed: 2, liveFetches: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the live request counted when thumbnail creation fails afterward", async () => {
    const storageDir = await createTempRoot();
    const fetchMock = vi.fn(
      async () =>
        new Response("not an image", {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const summary = await backfillImages(
      [createCandidate("thumbnail-failure", "2026-06-08T08:05:00.000Z")],
      createOptions({ storageDir }),
      { log: () => {}, debugLog: () => {} },
    );

    expect(summary).toMatchObject({ failed: 1, liveFetches: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

function createCandidate(id: string, seenAt: string): ProductImageCandidate {
  const date = new Date(seenAt);

  return {
    id,
    name: id,
    primaryImageUrl: `https://www.coolpc.com.tw/eval/4/${id}.jpg`,
    primaryImageCheckedAt: date,
    firstSeenAt: date,
    lastSeenAt: date,
    sourceCategory: {
      igrp: 4,
      displayName: "CPU",
    },
  };
}

function createOptions(overrides: Partial<ImageBackfillOptions> = {}): ImageBackfillOptions {
  const storageDir = overrides.storageDir ?? "/workspace/storage/product-images";

  return {
    workspaceRoot: "/workspace",
    storageDir,
    limit: null,
    productId: null,
    igrp: null,
    minDelayMs: 3000,
    maxDelayMs: 8000,
    timeoutMs: 15000,
    maxSourceBytes: 5 * 1024 * 1024,
    externalFetchLockDir: join(storageDir, ".locks", "external-fetch"),
    externalFetchLockStaleSeconds: 43200,
    dryRun: false,
    overwrite: false,
    ...overrides,
  };
}

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "partsradar-image-cache-backfill-"));
  tempRoots.push(root);

  return root;
}
