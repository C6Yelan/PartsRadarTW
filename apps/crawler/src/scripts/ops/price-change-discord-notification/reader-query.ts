// apps/crawler/src/scripts/ops/price-change-discord-notification/reader-query.ts

import type { Prisma } from "@partsradar/db";

export const PRICE_SNAPSHOT_WITH_PRODUCT_SELECT = {
  id: true,
  productId: true,
  price: true,
  currency: true,
  capturedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      vendorSlug: true,
      vendorName: true,
      sourceCategory: {
        select: {
          igrp: true,
          displayName: true,
        },
      },
    },
  },
} as const;

export const PREVIOUS_PRICE_SNAPSHOT_SELECT = {
  id: true,
  productId: true,
  price: true,
  currency: true,
  capturedAt: true,
} as const;

export const CURRENT_PRICE_SNAPSHOT_ORDER_BY: Prisma.PriceSnapshotOrderByWithRelationInput[] = [
  { capturedAt: "asc" },
  { id: "asc" },
];

export const PREVIOUS_PRICE_SNAPSHOT_ORDER_BY: Prisma.PriceSnapshotOrderByWithRelationInput[] = [
  { productId: "asc" },
  { capturedAt: "desc" },
  { id: "desc" },
];
