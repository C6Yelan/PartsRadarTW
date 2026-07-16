// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-processor-selection.test.ts
// 驗證圖片快取補圖的候選選擇、排序、保留期與既有檔案校正行為。

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backfillImages,
  readCandidates,
  readBoundedImageRecoveryBatch,
} from "../../../../src/scripts/ops/image-cache-backfill/processor";
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

describe("image cache backfill live request accounting", () => {
  it("fills a full batch from never-checked products without querying later lanes", async () => {
    const storageDir = await createTempRoot(tempRoots);
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
    const storageDir = await createTempRoot(tempRoots);
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
    const storageDir = await createTempRoot(tempRoots);
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
    const storageDir = await createTempRoot(tempRoots);
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
    const storageDir = await createTempRoot(tempRoots);
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
    const storageDir = await createTempRoot(tempRoots);
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
    const storageDir = await createTempRoot(tempRoots);
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
});
