// apps/crawler/src/scripts/ops/discord-bot/price-report/reader-query.ts
// 集中定義價格報告 reader 查詢 price snapshot 時共用的 Prisma select 與排序規則。

import type { Prisma } from "@partsradar/db";

// 讀取本次報告期間的 price snapshot，並帶出組裝 Discord 報告需要的商品與分類欄位。
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

// 讀取前一次 price snapshot 時只保留價格比對需要的欄位。
export const PREVIOUS_PRICE_SNAPSHOT_SELECT = {
  id: true,
  productId: true,
  price: true,
  currency: true,
  capturedAt: true,
} as const;

// 本次期間 snapshot 依時間與 id 遞增，讓同商品多筆變動能以穩定順序處理。
export const CURRENT_PRICE_SNAPSHOT_ORDER_BY: Prisma.PriceSnapshotOrderByWithRelationInput[] = [
  { capturedAt: "asc" },
  { id: "asc" },
];

// 前次 snapshot 依商品分組後由新到舊排序，方便 reader 找到每筆 current 之前的最近價格。
export const PREVIOUS_PRICE_SNAPSHOT_ORDER_BY: Prisma.PriceSnapshotOrderByWithRelationInput[] = [
  { productId: "asc" },
  { capturedAt: "desc" },
  { id: "desc" },
];
