// apps/web/app/api/products/response.ts
// 將商品列表查詢結果轉成 public API response，組裝商品卡片、價格變動、分頁與 meta。

import {
  COOLPC_SOURCE_NAME,
  createCoolpcPurchaseUrl,
  createPublicProductImagePath,
} from "@partsradar/shared";
import type { SourceStatusCategoryRecord } from "../source-status/data";
import { buildSourceStatusResponse, type SourceStatus } from "../source-status/response";
import {
  PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
  type ProductPriceMovementSnapshotRecord,
  type ProductRecord,
} from "./data";
import type { ProductVendorOption } from "./query";

// 商品列表前端與配單入口使用的單筆商品 response contract。
interface ProductListResponseItem {
  id: string;
  name: string;
  category: {
    id: string;
    igrp: number;
    displayName: string;
    sourceName: string;
  };
  image: {
    url: string;
    alt: string;
  } | null;
  price: {
    amount: number;
    currency: "TWD";
    capturedAt: string;
    lastSeenAt: string;
  };
  priceMovement: {
    rangeDays: typeof PRODUCT_PRICE_MOVEMENT_RANGE_DAYS;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
  source: {
    name: typeof COOLPC_SOURCE_NAME;
    url: string;
  };
  status: {
    isActive: boolean;
  };
}

export type ProductPriceMovement = ProductListResponseItem["priceMovement"];

// 商品列表 API 的完整 response contract，包含商品資料、分頁與來源/品牌 meta。
export interface ProductsResponseBody {
  data: ProductListResponseItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    sourceStatus: SourceStatus;
    lastSuccessAt: string | null;
    vendors: ProductVendorOption[];
  };
}

// 依目前分類篩選來源狀態；未指定分類時使用所有啟用來源分類彙整。
export function buildProductSourceStatus(
  categories: SourceStatusCategoryRecord[],
  igrp: number | undefined,
  now: Date,
) {
  const sourceCategories =
    igrp === undefined ? categories : categories.filter((category) => category.igrp === igrp);

  return buildSourceStatusResponse(sourceCategories, now);
}

// 將 DB product projection 轉成單筆 public response，並重新產生公開購買連結。
export function toProductResponseItemWithMovement(
  product: ProductRecord,
  movement: ProductListResponseItem["priceMovement"],
): ProductListResponseItem {
  if (!product.currentPrice) {
    throw new Error("Product list query returned a product without current price.");
  }

  return {
    id: product.id,
    name: product.name,
    category: {
      id: product.sourceCategory.id,
      igrp: product.sourceCategory.igrp,
      displayName: product.sourceCategory.displayName,
      sourceName: product.sourceCategory.sourceName,
    },
    image: toProductListImage(product),
    price: {
      amount: product.currentPrice.priceSnapshot.price,
      currency: product.currentPrice.priceSnapshot.currency,
      capturedAt: product.currentPrice.priceSnapshot.capturedAt.toISOString(),
      lastSeenAt: product.currentPrice.lastSeenAt.toISOString(),
    },
    priceMovement: movement,
    source: {
      name: COOLPC_SOURCE_NAME,
      // 使用 ibuyToken 重新組公開購買連結，避免 crawler 儲存的來源 URL 被直接外露。
      url: createCoolpcPurchaseUrl(product.ibuyToken),
    },
    status: {
      isActive: product.isActive,
    },
  };
}

// 將商品圖片欄位轉成列表用的公開圖片資訊。
function toProductListImage(product: ProductRecord): ProductListResponseItem["image"] {
  if (!product.primaryImageUrl) {
    return null;
  }

  return {
    // 圖片路徑由 shared helper 產生，避免列表、詳細頁與 smoke test 的公開圖片 URL 漂移。
    url: createPublicProductImagePath(product.id),
    alt: product.name,
  };
}

// 依 productId 分組歷史快照，替商品列表建立近 30 天價格變動查表。
export function buildProductPriceMovementMap(
  products: ProductRecord[],
  snapshots: ProductPriceMovementSnapshotRecord[],
  now: Date,
) {
  const snapshotsByProductId = new Map<string, ProductPriceMovementSnapshotRecord[]>();

  for (const snapshot of snapshots) {
    const productSnapshots = snapshotsByProductId.get(snapshot.productId) ?? [];
    productSnapshots.push(snapshot);
    snapshotsByProductId.set(snapshot.productId, productSnapshots);
  }

  return new Map(
    products.map((product) => [
      product.id,
      toProductPriceMovement(product, snapshotsByProductId.get(product.id) ?? [], now),
    ]),
  );
}

// 計算目前價格相對於近 30 天基準價的變動；資料不足時回傳 null movement。
function toProductPriceMovement(
  product: ProductRecord,
  snapshots: ProductPriceMovementSnapshotRecord[],
  now = new Date(),
): ProductListResponseItem["priceMovement"] {
  if (!product.currentPrice) {
    throw new Error("Product list query returned a product without current price.");
  }

  const since = new Date(now.getTime() - PRODUCT_PRICE_MOVEMENT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const sortedSnapshots = [...snapshots].sort(
    (left, right) => left.capturedAt.getTime() - right.capturedAt.getTime(),
  );
  const snapshotsInRange = sortedSnapshots.filter(
    (snapshot) => snapshot.capturedAt.getTime() >= since.getTime(),
  );
  const baselineBeforeRange = sortedSnapshots.findLast(
    (snapshot) => snapshot.capturedAt.getTime() < since.getTime(),
  );
  const baseline = baselineBeforeRange ?? snapshotsInRange[0] ?? null;
  const currentPrice = product.currentPrice.priceSnapshot.price;

  if (!baseline || product.currentPrice.lastSeenAt.getTime() < since.getTime()) {
    return {
      rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
      deltaAmount: null,
      deltaPercent: null,
    };
  }

  const hasOnlyInitialObservation =
    snapshotsInRange.length === 1 &&
    snapshotsInRange[0].capturedAt.getTime() === product.currentPrice.lastSeenAt.getTime();

  if (!baselineBeforeRange && hasOnlyInitialObservation) {
    return {
      rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
      deltaAmount: null,
      deltaPercent: null,
    };
  }

  const deltaAmount = currentPrice - baseline.price;

  return {
    rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
    deltaAmount,
    deltaPercent:
      baseline.price === 0 ? null : Number(((deltaAmount / baseline.price) * 100).toFixed(2)),
  };
}
