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
  readImageRecoveryCandidates,
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

  it("selects an existing product when its WebP is missing", async () => {
    const storageDir = await createTempRoot();
    const candidate = createCandidate("existing-missing", "2026-06-08T08:05:00.000Z");
    const updates: unknown[] = [];
    const client = {
      product: {
        findMany: async () => [candidate],
        update: async (args: unknown) => {
          updates.push(args);
          return candidate;
        },
      },
    } as never;

    const selected = await readImageRecoveryCandidates(
      client,
      createOptions({ storageDir }),
      25,
      new Date("2026-06-09T08:05:00.000Z"),
    );

    expect(selected.map(({ id }) => id)).toEqual(["existing-missing"]);
    expect(updates).toEqual([]);
  });

  it("marks an inactive historical product cache-ready when its WebP already exists", async () => {
    const storageDir = await createTempRoot();
    const candidate = {
      ...createCandidate("historical-existing", "2026-05-01T08:05:00.000Z"),
      isActive: false,
      priceSnapshots: [{ capturedAt: new Date("2026-05-01T08:05:00.000Z") }],
    };
    const updates: unknown[] = [];
    await writeFile(join(storageDir, `${candidate.id}.webp`), "webp");
    const client = {
      product: {
        findMany: async () => [candidate],
        update: async (args: unknown) => {
          updates.push(args);
          return candidate;
        },
      },
    } as never;

    const selected = await readImageRecoveryCandidates(
      client,
      createOptions({ storageDir, inactiveRetentionDays: 30 }),
      25,
      new Date("2026-06-09T08:05:00.000Z"),
    );

    expect(selected).toEqual([]);
    expect(updates).toEqual([
      expect.objectContaining({
        where: { id: candidate.id },
        data: expect.objectContaining({
          imageCachedAt: new Date("2026-06-09T08:05:00.000Z"),
          imageCacheFailureCount: 0,
          imageCacheNextRetryAt: null,
        }),
      }),
    ]);
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

  it("reconciles an existing WebP without depending on a still-valid source URL", async () => {
    const storageDir = await createTempRoot();
    const candidate = {
      ...createCandidate("existing-invalid-source", "2026-05-01T08:05:00.000Z"),
      primaryImageUrl: "https://invalid.example/image.jpg",
    };
    const update = vi.fn(async () => candidate);
    await writeFile(join(storageDir, `${candidate.id}.webp`), "webp");

    const summary = await backfillImages(
      [candidate],
      createOptions({ storageDir }),
      { log: () => {}, debugLog: () => {} },
      { product: { update } } as never,
    );

    expect(summary).toMatchObject({ selected: 1, skipped: 1, invalid: 0, liveFetches: 0 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: candidate.id },
        data: expect.objectContaining({ imageCacheFailureCount: 0, imageCacheNextRetryAt: null }),
      }),
    );
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

  it("rotates expired inactive recovery rows without fetching or marking them ready", async () => {
    const storageDir = await createTempRoot();
    const candidate = {
      ...createCandidate("expired-recovery", "2026-04-01T08:05:00.000Z"),
      isActive: false,
      priceSnapshots: [{ capturedAt: new Date("2026-04-01T08:05:00.000Z") }],
    };
    const updates: unknown[] = [];
    const client = {
      product: {
        findMany: async () => [candidate],
        update: async (args: unknown) => {
          updates.push(args);
          return candidate;
        },
      },
    } as never;
    const now = new Date("2026-06-09T08:05:00.000Z");

    await expect(
      readImageRecoveryCandidates(
        client,
        createOptions({ storageDir, inactiveRetentionDays: 30 }),
        25,
        now,
      ),
    ).resolves.toEqual([]);
    expect(updates).toEqual([
      {
        where: { id: candidate.id },
        data: { imageCacheCheckedAt: now },
      },
    ]);
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
