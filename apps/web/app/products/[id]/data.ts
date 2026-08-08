// apps/web/app/products/[id]/data.ts
// 提供商品頁與 metadata 共用的 request-scoped server read，避免同一 request 重複查詢。

import { cache } from "react";
import {
  findPublicProductDetail,
  type ProductDetailReadClient,
} from "../../api/products/[id]/data";
import { toProductDetailResponse } from "../../api/products/[id]/response";

export const getPublicProductDetail = cache(async (productId: string) => {
  const { prisma } = await import("@partsradar/db");
  const client: ProductDetailReadClient = {
    product: {
      findFirst: (args) => prisma.product.findFirst(args),
    },
  };
  const product = await findPublicProductDetail(client, productId);

  return product ? toProductDetailResponse(product) : null;
});
