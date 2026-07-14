// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-candidate-query.test.ts
// 驗證補圖候選涵蓋 active、metadata drift 與近期仍被價格歷史引用的商品。

import { describe, expect, it } from "vitest";
import {
  CACHED_IMAGE_AUDIT_ORDER_BY,
  createCachedImageAuditWhere,
  createDueImageRetryWhere,
  createNeverCheckedImageRecoveryWhere,
  createProductImageCandidateWhere,
  DUE_IMAGE_RETRY_ORDER_BY,
  NEVER_CHECKED_IMAGE_RECOVERY_ORDER_BY,
} from "../../../../src/scripts/ops/image-cache-backfill/candidate-query";
import type { ImageBackfillOptions } from "../../../../src/scripts/ops/image-cache-backfill/options";

describe("image cache backfill candidate query", () => {
  it("includes active, metadata-drift, and recently price-referenced products", () => {
    const now = new Date("2026-06-09T08:00:00.000Z");

    expect(createProductImageCandidateWhere(createOptions(), now)).toMatchObject({
      OR: [
        { isActive: true },
        { imageCachedAt: null },
        {
          priceSnapshots: {
            some: { capturedAt: { gte: new Date("2026-05-10T08:00:00.000Z") } },
          },
        },
      ],
      primaryImageUrl: { not: null },
      sourceCategory: { enabled: true },
    });
  });

  it("builds mutually exclusive recovery lanes that exclude expired and future-retry rows", () => {
    const now = new Date("2026-06-09T08:00:00.000Z");
    const usefulProductWhere = {
      primaryImageUrl: { not: null },
      sourceCategory: { enabled: true },
      OR: [
        { isActive: true },
        {
          isActive: false,
          priceSnapshots: {
            some: { capturedAt: { gte: new Date("2026-05-10T08:00:00.000Z") } },
          },
        },
      ],
    };
    const retryDueWhere = {
      OR: [{ imageCacheNextRetryAt: null }, { imageCacheNextRetryAt: { lte: now } }],
    };

    expect(createNeverCheckedImageRecoveryWhere(createOptions(), now)).toEqual({
      AND: [
        usefulProductWhere,
        {
          imageCachedAt: null,
          imageCacheCheckedAt: null,
          ...retryDueWhere,
        },
      ],
    });
    expect(createDueImageRetryWhere(createOptions(), now)).toEqual({
      AND: [
        usefulProductWhere,
        {
          imageCachedAt: null,
          imageCacheCheckedAt: { not: null },
          ...retryDueWhere,
        },
      ],
    });
    expect(createCachedImageAuditWhere(createOptions(), now)).toEqual({
      AND: [
        usefulProductWhere,
        {
          imageCachedAt: { not: null },
          ...retryDueWhere,
        },
      ],
    });
  });

  it("uses explicit priorities, stable tie-breakers, and nullable timestamp ordering", () => {
    expect(NEVER_CHECKED_IMAGE_RECOVERY_ORDER_BY).toEqual([
      { isActive: "desc" },
      { firstSeenAt: "desc" },
      { sourceCategory: { igrp: "asc" } },
      { id: "asc" },
    ]);
    expect(DUE_IMAGE_RETRY_ORDER_BY).toEqual([
      { imageCacheNextRetryAt: { sort: "asc", nulls: "first" } },
      { isActive: "desc" },
      { lastSeenAt: "desc" },
      { sourceCategory: { igrp: "asc" } },
      { id: "asc" },
    ]);
    expect(CACHED_IMAGE_AUDIT_ORDER_BY).toEqual([
      { imageCacheCheckedAt: { sort: "asc", nulls: "first" } },
      { sourceCategory: { igrp: "asc" } },
      { id: "asc" },
    ]);
  });
});

function createOptions(): ImageBackfillOptions {
  return {
    workspaceRoot: "/workspace",
    storageDir: "/workspace/storage/product-images",
    limit: null,
    productId: null,
    igrp: null,
    inactiveRetentionDays: 30,
    minDelayMs: 0,
    maxDelayMs: 0,
    timeoutMs: 15000,
    maxSourceBytes: 5 * 1024 * 1024,
    sourceImageFetchLockDir: "/workspace/locks",
    sourceImageFetchLockStaleSeconds: 43200,
    dryRun: true,
    overwrite: false,
  };
}
