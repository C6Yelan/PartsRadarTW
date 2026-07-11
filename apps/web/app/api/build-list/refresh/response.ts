// apps/web/app/api/build-list/refresh/response.ts
// 將批次商品查詢結果轉成配單頁需要的 public snapshot contract。

import { createCoolpcPurchaseUrl, createPublicProductImagePath } from "@partsradar/shared";

import type { BuildListProductSnapshot } from "../../../build-list/model";
import type { BuildListRefreshRecord } from "./data";

export interface BuildListRefreshResponseBody {
  data: BuildListProductSnapshot[];
  missingProductIds: string[];
}

export function toBuildListRefreshProduct(
  product: BuildListRefreshRecord,
): BuildListProductSnapshot {
  return {
    id: product.id,
    name: product.name,
    image: product.primaryImageUrl
      ? {
          url: createPublicProductImagePath(product.id),
          alt: product.name,
        }
      : null,
    category: {
      displayName: product.sourceCategory.displayName,
    },
    price: product.currentPrice
      ? {
          amount: product.currentPrice.priceSnapshot.price,
          currency: product.currentPrice.priceSnapshot.currency,
        }
      : null,
    source: {
      url: createCoolpcPurchaseUrl(product.ibuyToken),
    },
    status: {
      isActive: product.isActive,
    },
    lastSeenAt: product.lastSeenAt.toISOString(),
  };
}
