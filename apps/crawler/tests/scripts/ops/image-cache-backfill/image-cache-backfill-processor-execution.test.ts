// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-processor-execution.test.ts
// 驗證圖片快取補圖的執行、請求計數、重用、鎖定與摘要行為。

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backfillImages } from "../../../../src/scripts/ops/image-cache-backfill/processor";
import { tryAcquireExternalFetchLock } from "../../../../src/scripts/ops/external-fetch-lock";
import {
  cleanupTempRoots,
  createCandidate,
  createOptions,
  createTempRoot,
} from "./image-cache-backfill-processor.support";

const tempRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupTempRoots(tempRoots);
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
  it("persists a bounded retry after a source failure", async () => {
    const storageDir = await createTempRoot(tempRoots);
    const updates: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("source unavailable");
      }),
    );
    const candidate = createCandidate("retry-state", "2026-06-08T08:05:00.000Z");

    await backfillImages(
      [candidate],
      createOptions({ storageDir }),
      { log: () => {}, debugLog: () => {} },
      {
        product: {
          update: async (args: unknown) => {
            updates.push(args);
            return candidate;
          },
          updateMany: async (args: unknown) => {
            updates.push(args);
            return { count: 1 };
          },
        },
      } as never,
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      where: { primaryImageUrl: candidate.primaryImageUrl },
      data: {
        imageCachedAt: null,
        imageCacheFailureCount: 1,
        imageCacheLastError: "source unavailable",
        imageCacheLastErrorKind: "network",
      },
    });
  });

  it("requests a shared failing source URL only once per batch", async () => {
    const storageDir = await createTempRoot(tempRoots);
    const fetchMock = vi.fn(async () => {
      throw new Error("source unavailable");
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = createCandidate("shared-first", "2026-06-08T08:05:00.000Z");
    const second = {
      ...createCandidate("shared-second", "2026-06-08T08:05:00.000Z"),
      primaryImageUrl: first.primaryImageUrl,
    };

    const summary = await backfillImages(
      [first, second],
      createOptions({ storageDir, minDelayMs: 0, maxDelayMs: 0 }),
      { log: () => {}, debugLog: () => {} },
    );

    expect(summary).toMatchObject({ failed: 2, liveFetches: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not count a shared-lock deferral as a source request", async () => {
    const storageDir = await createTempRoot(tempRoots);
    const options = createOptions({ storageDir });
    const fetchMock = vi.fn();
    const existingLock = await tryAcquireExternalFetchLock({
      lockDir: options.sourceImageFetchLockDir,
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
    const storageDir = await createTempRoot(tempRoots);
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
    const storageDir = await createTempRoot(tempRoots);
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
    const storageDir = await createTempRoot(tempRoots);
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

  it("stops reading a source image stream as soon as the byte limit is exceeded", async () => {
    const storageDir = await createTempRoot(tempRoots);
    let streamCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel() {
        streamCancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
      ),
    );

    const summary = await backfillImages(
      [createCandidate("oversized-stream", "2026-06-08T08:05:00.000Z")],
      createOptions({ storageDir, maxSourceBytes: 5 }),
      { log: () => {}, debugLog: () => {} },
    );

    expect(summary).toMatchObject({ failed: 1, liveFetches: 1 });
    expect(streamCancelled).toBe(true);
  });
});
