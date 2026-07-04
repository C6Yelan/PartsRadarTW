// apps/crawler/src/scripts/ops/image-cache-backfill/candidate-query.ts

import type { Prisma } from "@partsradar/db";
import type { ImageBackfillOptions } from "./options";

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

export function createProductImageCandidateSelect() {
  return {
    id: true,
    name: true,
    primaryImageUrl: true,
    primaryImageCheckedAt: true,
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

export const PRODUCT_IMAGE_CANDIDATE_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { sourceCategory: { igrp: "asc" } },
  { id: "asc" },
];

export const MISSING_IMAGE_CANDIDATE_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { firstSeenAt: "desc" },
  { lastSeenAt: "desc" },
  { primaryImageCheckedAt: "desc" },
  { sourceCategory: { igrp: "asc" } },
  { id: "asc" },
];

export const MISSING_IMAGE_CANDIDATE_BY_IDS_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { firstSeenAt: "desc" },
  { lastSeenAt: "desc" },
  { sourceCategory: { igrp: "asc" } },
  { id: "asc" },
];
