// apps/crawler/src/scripts/ops/image-cache-backfill/candidate-query.ts
// 集中建立商品圖片補圖流程使用的 Prisma candidate 查詢條件、欄位選取與排序規則。

import type { Prisma } from "@partsradar/db";
import type { ImageBackfillOptions } from "./options";

// 建立一般補圖候選查詢條件，納入 active、近期價格引用與 cache metadata 待校正商品。
export function createProductImageCandidateWhere(
  options: ImageBackfillOptions,
  now = new Date(),
): Prisma.ProductWhereInput {
  const retentionCutoff = new Date(
    now.getTime() - options.inactiveRetentionDays * 24 * 60 * 60 * 1000,
  );

  return {
    ...(options.productId ? { id: options.productId } : {}),
    ...(options.productId
      ? {}
      : {
          OR: [
            { isActive: true },
            { imageCachedAt: null },
            { priceSnapshots: { some: { capturedAt: { gte: retentionCutoff } } } },
          ],
        }),
    primaryImageUrl: { not: null },
    sourceCategory: {
      ...(options.igrp === null ? {} : { igrp: options.igrp }),
      enabled: true,
    },
  };
}

// 定義補圖候選所需的最小欄位，讓 processor 不依賴完整 product row。
export function createProductImageCandidateSelect() {
  return {
    id: true,
    name: true,
    isActive: true,
    primaryImageUrl: true,
    primaryImageCheckedAt: true,
    imageCachedAt: true,
    imageCacheCheckedAt: true,
    imageCacheFailureCount: true,
    imageCacheFailureSince: true,
    imageCacheNextRetryAt: true,
    firstSeenAt: true,
    lastSeenAt: true,
    priceSnapshots: {
      select: { capturedAt: true },
      orderBy: { capturedAt: "desc" },
      take: 1,
    },
    sourceCategory: {
      select: {
        igrp: true,
        displayName: true,
      },
    },
  } as const;
}

// 一般候選依來源分類與 product id 穩定排序，方便 dry-run 與手動補圖比對。
export const PRODUCT_IMAGE_CANDIDATE_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { sourceCategory: { igrp: "asc" } },
  { id: "asc" },
];

function createUsefulImageRecoveryWhere(
  options: ImageBackfillOptions,
  now: Date,
): Prisma.ProductWhereInput {
  const retentionCutoff = new Date(
    now.getTime() - options.inactiveRetentionDays * 24 * 60 * 60 * 1000,
  );

  return {
    primaryImageUrl: { not: null },
    sourceCategory: {
      ...(options.igrp === null ? {} : { igrp: options.igrp }),
      enabled: true,
    },
    OR: [
      { isActive: true },
      {
        isActive: false,
        priceSnapshots: { some: { capturedAt: { gte: retentionCutoff } } },
      },
    ],
  };
}

export function createNeverCheckedImageRecoveryWhere(
  options: ImageBackfillOptions,
  now: Date,
): Prisma.ProductWhereInput {
  return {
    AND: [
      createUsefulImageRecoveryWhere(options, now),
      {
        imageCachedAt: null,
        imageCacheCheckedAt: null,
        OR: [{ imageCacheNextRetryAt: null }, { imageCacheNextRetryAt: { lte: now } }],
      },
    ],
  };
}

export function createDueImageRetryWhere(
  options: ImageBackfillOptions,
  now: Date,
): Prisma.ProductWhereInput {
  return {
    AND: [
      createUsefulImageRecoveryWhere(options, now),
      {
        imageCachedAt: null,
        imageCacheCheckedAt: { not: null },
        OR: [{ imageCacheNextRetryAt: null }, { imageCacheNextRetryAt: { lte: now } }],
      },
    ],
  };
}

export function createCachedImageAuditWhere(
  options: ImageBackfillOptions,
  now: Date,
): Prisma.ProductWhereInput {
  return {
    AND: [
      createUsefulImageRecoveryWhere(options, now),
      {
        imageCachedAt: { not: null },
        OR: [{ imageCacheNextRetryAt: null }, { imageCacheNextRetryAt: { lte: now } }],
      },
    ],
  };
}

export const NEVER_CHECKED_IMAGE_RECOVERY_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { isActive: "desc" },
  { firstSeenAt: "desc" },
  ...PRODUCT_IMAGE_CANDIDATE_ORDER_BY,
];

export const DUE_IMAGE_RETRY_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { imageCacheNextRetryAt: { sort: "asc", nulls: "first" } },
  { isActive: "desc" },
  { lastSeenAt: "desc" },
  ...PRODUCT_IMAGE_CANDIDATE_ORDER_BY,
];

export const CACHED_IMAGE_AUDIT_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { imageCacheCheckedAt: { sort: "asc", nulls: "first" } },
  ...PRODUCT_IMAGE_CANDIDATE_ORDER_BY,
];
