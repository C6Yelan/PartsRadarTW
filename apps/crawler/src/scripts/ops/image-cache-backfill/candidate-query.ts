// apps/crawler/src/scripts/ops/image-cache-backfill/candidate-query.ts
// 集中建立商品圖片補圖流程使用的 Prisma candidate 查詢條件、欄位選取與排序規則。

import type { Prisma } from "@partsradar/db";
import type { ImageBackfillOptions } from "./options";

// 建立一般補圖候選查詢條件，只選啟用分類、active 商品與有來源圖片 URL 的商品。
export function createProductImageCandidateWhere(
  options: ImageBackfillOptions,
): Prisma.ProductWhereInput {
  return {
    ...(options.productId ? { id: options.productId } : {}),
    isActive: true,
    primaryImageUrl: { not: null },
    sourceCategory: {
      ...(options.igrp === null ? {} : { igrp: options.igrp }),
      enabled: true,
    },
  };
}

// 建立指定 product id 補圖查詢條件，仍保留 active、來源圖片與啟用分類限制。
export function createProductImageCandidateByIdsWhere(
  productIds: string[],
): Prisma.ProductWhereInput {
  return {
    id: { in: productIds },
    isActive: true,
    primaryImageUrl: { not: null },
    sourceCategory: {
      enabled: true,
    },
  };
}

// 定義補圖候選所需的最小欄位，讓 processor 不依賴完整 product row。
export function createProductImageCandidateSelect() {
  return {
    id: true,
    name: true,
    primaryImageUrl: true,
    primaryImageCheckedAt: true,
    imageCachedAt: true,
    imageCacheCheckedAt: true,
    imageCacheFailureCount: true,
    imageCacheNextRetryAt: true,
    firstSeenAt: true,
    lastSeenAt: true,
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

// 指定 product id 缺圖候選同樣以新商品優先，不讓 primaryImageCheckedAt 影響補圖順序。
export const MISSING_IMAGE_CANDIDATE_BY_IDS_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { firstSeenAt: "desc" },
  { lastSeenAt: "desc" },
  { sourceCategory: { igrp: "asc" } },
  { id: "asc" },
];
