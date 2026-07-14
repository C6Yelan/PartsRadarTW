// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-processor.test.ts
// 驗證圖片快取補圖的 dry-run log、錯誤計數、重用與摘要行為。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageBackfillOptions } from "../../../../src/scripts/ops/image-cache-backfill/options";
import {
  backfillImages,
  readCandidates,
  readBoundedImageRecoveryBatch,
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
  it("persists a bounded retry after a source failure", async () => {
    const storageDir = await createTempRoot();
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
    const storageDir = await createTempRoot();
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

  it("fills a full batch from never-checked products without querying later lanes", async () => {
    const storageDir = await createTempRoot();
    const candidates = Array.from({ length: 25 }, (_, index) =>
      createCandidate(`new-${index}`, `2026-06-08T08:${String(59 - index).padStart(2, "0")}:00.000Z`),
    );
    const findManyArgs: unknown[] = [];
    const client = {
      product: {
        findMany: async (args: unknown) => {
          findManyArgs.push(args);
          return candidates;
        },
      },
    } as never;

    const batch = await readBoundedImageRecoveryBatch(
      client,
      createOptions({ storageDir }),
      25,
      new Date("2026-06-09T08:05:00.000Z"),
    );

    expect(findManyArgs).toHaveLength(1);
    expect(findManyArgs[0]).toMatchObject({
      take: 25,
      orderBy: [
        { isActive: "desc" },
        { firstSeenAt: "desc" },
        { sourceCategory: { igrp: "asc" } },
        { id: "asc" },
      ],
      where: {
        AND: expect.arrayContaining([
          expect.objectContaining({ imageCachedAt: null, imageCacheCheckedAt: null }),
        ]),
      },
    });
    expect(batch.candidates).toHaveLength(25);
    expect(batch.telemetry).toMatchObject({
      neverCheckedRead: 25,
      retryDueRead: 0,
      auditRead: 0,
      selectedForBackfill: 25,
    });
  });

  it("allocates remaining capacity to retry and then audit lanes", async () => {
    const storageDir = await createTempRoot();
    const neverChecked = Array.from({ length: 20 }, (_, index) =>
      createCandidate(`new-${index}`, "2026-06-08T08:05:00.000Z"),
    );
    const retries = Array.from({ length: 3 }, (_, index) => ({
      ...createCandidate(`retry-${index}`, "2026-06-07T08:05:00.000Z"),
      imageCacheCheckedAt: new Date("2026-06-08T08:05:00.000Z"),
    }));
    const audits = Array.from({ length: 2 }, (_, index) => ({
      ...createCandidate(`audit-${index}`, "2026-06-06T08:05:00.000Z"),
      imageCachedAt: new Date("2026-06-08T08:05:00.000Z"),
      imageCacheCheckedAt: new Date("2026-06-08T08:05:00.000Z"),
    }));
    const findManyArgs: Array<{ take: number }> = [];
    const laneResults = [neverChecked, retries, audits];
    const client = {
      product: {
        findMany: async (args: { take: number }) => {
          findManyArgs.push(args);
          return laneResults[findManyArgs.length - 1];
        },
      },
    } as never;

    const batch = await readBoundedImageRecoveryBatch(
      client,
      createOptions({ storageDir }),
      25,
      new Date("2026-06-09T08:05:00.000Z"),
    );

    expect(findManyArgs.map(({ take }) => take)).toEqual([25, 5, 2]);
    expect(batch.candidates).toHaveLength(25);
    expect(batch.telemetry).toEqual({
      neverCheckedRead: 20,
      retryDueRead: 3,
      auditRead: 2,
      reconciledExisting: 0,
      selectedForBackfill: 25,
    });
  });

  it("does not reconcile existing WebP metadata during dry-run", async () => {
    const storageDir = await createTempRoot();
    const candidate = createCandidate("dry-run-existing", "2026-06-01T08:05:00.000Z");
    const update = vi.fn();
    await writeFile(join(storageDir, `${candidate.id}.webp`), "webp");

    const summary = await backfillImages(
      [candidate],
      createOptions({ storageDir, dryRun: true }),
      { log: () => {}, debugLog: () => {} },
      { product: { update } } as never,
    );

    expect(summary).toMatchObject({ selected: 1, skipped: 1, liveFetches: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it("selects a new product before a large cached audit pool", async () => {
    const storageDir = await createTempRoot();
    const newProduct = createCandidate("new-product", "2026-06-09T08:04:00.000Z");
    const cachedProducts = Array.from({ length: 50 }, (_, index) => ({
      ...createCandidate(`cached-${index}`, "2026-05-01T08:05:00.000Z"),
      imageCachedAt: new Date("2026-05-01T09:00:00.000Z"),
      imageCacheCheckedAt: new Date("2026-05-01T09:00:00.000Z"),
    }));
    const laneResults = [[newProduct], [], cachedProducts.slice(0, 24)];
    const findManyArgs: Array<{ take: number }> = [];
    const client = {
      product: {
        findMany: async (args: { take: number }) => {
          findManyArgs.push(args);
          return laneResults[findManyArgs.length - 1];
        },
      },
    } as never;

    const batch = await readBoundedImageRecoveryBatch(
      client,
      createOptions({ storageDir }),
      25,
      new Date("2026-06-09T08:05:00.000Z"),
    );

    expect(findManyArgs.map(({ take }) => take)).toEqual([25, 24, 24]);
    expect(batch.candidates[0]?.id).toBe("new-product");
    expect(batch.telemetry).toMatchObject({ neverCheckedRead: 1, auditRead: 24 });
  });

  it("only selects missing inactive products inside retention unless explicitly requested", async () => {
    const storageDir = await createTempRoot();
    const recent = {
      ...createCandidate("recent-inactive", "2026-05-20T08:05:00.000Z"),
      isActive: false,
      priceSnapshots: [{ capturedAt: new Date("2026-06-01T08:05:00.000Z") }],
    };
    const expired = {
      ...createCandidate("expired-inactive", "2026-04-01T08:05:00.000Z"),
      isActive: false,
      priceSnapshots: [{ capturedAt: new Date("2026-04-01T08:05:00.000Z") }],
    };
    const client = {
      product: {
        findMany: async ({ where }: { where: { id?: string } }) =>
          where.id
            ? [expired, recent].filter((candidate) => candidate.id === where.id)
            : [expired, recent],
      },
    } as never;
    const now = new Date("2026-06-09T08:05:00.000Z");

    await expect(
      readCandidates(client, createOptions({ storageDir, inactiveRetentionDays: 30 }), now),
    ).resolves.toEqual([recent]);
    await expect(
      readCandidates(
        client,
        createOptions({
          storageDir,
          inactiveRetentionDays: 30,
          productId: expired.id,
        }),
        now,
      ),
    ).resolves.toEqual([expired]);
  });

  it("deduplicates the same product across lanes without replacing its consumed budget", async () => {
    const storageDir = await createTempRoot();
    const duplicate = createCandidate("duplicate", "2026-06-08T08:05:00.000Z");
    const laneResults = [[duplicate], [duplicate], []];
    const findManyArgs: Array<{ take: number }> = [];
    const client = {
      product: {
        findMany: async (args: { take: number }) => {
          findManyArgs.push(args);
          return laneResults[findManyArgs.length - 1];
        },
      },
    } as never;

    const batch = await readBoundedImageRecoveryBatch(
      client,
      createOptions({ storageDir }),
      3,
      new Date("2026-06-09T08:05:00.000Z"),
    );

    expect(findManyArgs.map(({ take }) => take)).toEqual([3, 2, 1]);
    expect(batch.candidates.map(({ id }) => id)).toEqual(["duplicate"]);
  });

  it("reconciles existing WebPs and backfills only missing files", async () => {
    const storageDir = await createTempRoot();
    const metadataNullExisting = createCandidate(
      "metadata-null-existing",
      "2026-06-08T08:05:00.000Z",
    );
    const auditExisting = {
      ...createCandidate("audit-existing", "2026-06-07T08:05:00.000Z"),
      imageCachedAt: new Date("2026-06-08T08:05:00.000Z"),
      imageCacheCheckedAt: new Date("2026-06-08T08:05:00.000Z"),
      imageCacheFailureCount: 3,
      imageCacheFailureSince: new Date("2026-06-01T08:05:00.000Z"),
      imageCacheNextRetryAt: null,
    };
    const auditMissing = {
      ...createCandidate("audit-missing", "2026-06-06T08:05:00.000Z"),
      imageCachedAt: new Date("2026-06-08T08:05:00.000Z"),
      imageCacheCheckedAt: new Date("2026-06-08T08:05:00.000Z"),
    };
    await writeFile(join(storageDir, `${metadataNullExisting.id}.webp`), "webp");
    await writeFile(join(storageDir, `${auditExisting.id}.webp`), "webp");
    const laneResults = [[metadataNullExisting], [], [auditExisting, auditMissing]];
    const updates: unknown[] = [];
    let laneIndex = 0;
    const now = new Date("2026-06-09T08:05:00.000Z");
    const client = {
      product: {
        findMany: async () => laneResults[laneIndex++],
        update: async (args: unknown) => {
          updates.push(args);
          return metadataNullExisting;
        },
      },
    } as never;

    const batch = await readBoundedImageRecoveryBatch(
      client,
      createOptions({ storageDir }),
      3,
      now,
    );

    expect(batch.candidates.map(({ id }) => id)).toEqual(["audit-missing"]);
    expect(batch.telemetry).toMatchObject({
      reconciledExisting: 2,
      selectedForBackfill: 1,
    });
    expect(updates).toHaveLength(2);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: { id: metadataNullExisting.id },
          data: expect.objectContaining({
            imageCachedAt: now,
            imageCacheCheckedAt: now,
            imageCacheLastSuccessAt: now,
            imageCacheFailureCount: 0,
            imageCacheNextRetryAt: null,
          }),
        }),
        expect.objectContaining({ where: { id: auditExisting.id } }),
      ]),
    );
  });

  it("does not count a shared-lock deferral as a source request", async () => {
    const storageDir = await createTempRoot();
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

function createOptions(overrides: Partial<ImageBackfillOptions> = {}): ImageBackfillOptions {
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

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "partsradar-image-cache-backfill-"));
  tempRoots.push(root);

  return root;
}
