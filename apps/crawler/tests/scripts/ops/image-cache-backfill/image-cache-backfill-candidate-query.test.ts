// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-candidate-query.test.ts
// 驗證補圖候選涵蓋 active、metadata drift 與近期仍被價格歷史引用的商品。

import { describe, expect, it } from "vitest";
import { createProductImageCandidateWhere } from "../../../../src/scripts/ops/image-cache-backfill/candidate-query";
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
