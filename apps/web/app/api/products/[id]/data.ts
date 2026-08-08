// apps/web/app/api/products/[id]/data.ts
// 定義商品詳細 API 使用的 Prisma select、回傳型別與窄 read client contract。

import type { Prisma } from "@partsradar/db";
import { normalizeProductId } from "../../../_shared/product-id";

// 限定商品詳細頁可讀取的 public-safe 欄位；ibuyToken 僅用來組 outbound CoolPC purchase URL。
export const PRODUCT_DETAIL_SELECT = {
  id: true,
  ibuyToken: true,
  name: true,
  primaryImageUrl: true,
  imageCachedAt: true,
  isActive: true,
  isExcluded: true,
  exclusionReason: true,
  lastSeenAt: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
          currency: true,
          capturedAt: true,
        },
      },
    },
  },
  sourceCategory: {
    select: {
      id: true,
      igrp: true,
      displayName: true,
      sourceName: true,
    },
  },
} as const satisfies Prisma.ProductSelect;

export type ProductDetailRecord = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_DETAIL_SELECT;
}>;

type ProductDetailFindFirstArgs = Omit<Prisma.ProductFindFirstArgs, "select"> & {
  select: typeof PRODUCT_DETAIL_SELECT;
};

// 商品詳細 API handler 使用的最小讀取介面，不依賴完整 Prisma client。
export interface ProductDetailReadClient {
  product: {
    findFirst(args: ProductDetailFindFirstArgs): Promise<ProductDetailRecord | null>;
  };
}

// 依共用公開可見性條件讀取單一商品，供 API 與 server-rendered 商品頁共用。
export async function findPublicProductDetail(
  client: ProductDetailReadClient,
  productId: string,
): Promise<ProductDetailRecord | null> {
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) {
    return null;
  }

  return client.product.findFirst({
    where: {
      id: normalizedProductId,
      sourceCategory: {
        enabled: true,
      },
      currentPrice: {
        isNot: null,
      },
    },
    select: PRODUCT_DETAIL_SELECT,
  });
}
