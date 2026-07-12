// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-candidate-query.test.ts
// 驗證手動補圖涵蓋 inactive 歷史商品，而 scheduled id 查詢仍維持 active-only。

import { describe, expect, it } from "vitest";
import {
  createProductImageCandidateByIdsWhere,
  createProductImageCandidateWhere,
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

  it("keeps scheduled new-product recovery active-only", () => {
    expect(createProductImageCandidateByIdsWhere(["product-1"])).toMatchObject({
      id: { in: ["product-1"] },
      isActive: true,
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
    externalFetchLockDir: "/workspace/locks",
    externalFetchLockStaleSeconds: 43200,
    dryRun: true,
    overwrite: false,
  };
}
