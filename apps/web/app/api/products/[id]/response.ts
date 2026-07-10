// apps/web/app/api/products/[id]/response.ts
// 將商品詳細查詢結果轉成 public API response，隔離 DB 欄位與來源站內部 URL。

import {
  COOLPC_SOURCE_NAME,
  createCoolpcPurchaseUrl,
  createPublicProductImagePath,
} from "@partsradar/shared";

import type { ProductDetailRecord } from "./data";

// 商品詳細頁使用的 public response contract，只暴露前端顯示與配單保存需要的資料。
export interface ProductDetailResponseBody {
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
    capturedAt: string;
  } | null;
  price: {
    amount: number;
    currency: "TWD";
    capturedAt: string;
    lastSeenAt: string;
    priceChangedAt: string;
  };
  source: {
    name: typeof COOLPC_SOURCE_NAME;
    url: string;
  };
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
  firstSeenAt: string;
  lastSeenAt: string;
}

// 組裝商品詳細 public response，並確保購買連結由 ibuyToken 重新產生而非直接回傳 crawler 儲存 URL。
export function toProductDetailResponse(product: ProductDetailRecord): ProductDetailResponseBody {
  if (!product.currentPrice) {
    throw new Error("Product detail query returned a product without current price.");
  }

  const purchaseUrl = createCoolpcPurchaseUrl(product.ibuyToken);

  return {
    id: product.id,
    name: product.name,
    category: {
      id: product.sourceCategory.id,
      igrp: product.sourceCategory.igrp,
      displayName: product.sourceCategory.displayName,
      sourceName: product.sourceCategory.sourceName,
    },
    image: toProductDetailImage(product),
    price: {
      amount: product.currentPrice.priceSnapshot.price,
      currency: product.currentPrice.priceSnapshot.currency,
      capturedAt: product.currentPrice.priceSnapshot.capturedAt.toISOString(),
      lastSeenAt: product.currentPrice.lastSeenAt.toISOString(),
      priceChangedAt: product.currentPrice.priceChangedAt.toISOString(),
    },
    source: {
      name: COOLPC_SOURCE_NAME,
      // 使用 ibuyToken 重新組公開購買連結，避免 crawler 儲存的來源 URL 被直接外露。
      url: purchaseUrl,
    },
    status: {
      isActive: product.isActive,
      missingSince: toIsoStringOrNull(product.missingSince),
    },
    firstSeenAt: product.firstSeenAt.toISOString(),
    lastSeenAt: product.lastSeenAt.toISOString(),
  };
}

// 只在圖片來源與檢查時間都存在時提供站內快取圖片路徑，避免回傳來源站 raw image URL。
function toProductDetailImage(product: ProductDetailRecord): ProductDetailResponseBody["image"] {
  if (!product.primaryImageUrl || !product.primaryImageCheckedAt) {
    return null;
  }

  return {
    url: createPublicProductImagePath(product.id),
    alt: product.name,
    capturedAt: product.primaryImageCheckedAt.toISOString(),
  };
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
