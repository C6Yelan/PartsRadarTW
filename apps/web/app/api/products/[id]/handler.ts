// apps/web/app/api/products/[id]/handler.ts
// 處理商品詳細 API 的商品 id 正規化、公開查詢條件與安全 JSON 回應。

import { internalErrorResponse, jsonOk, notFoundResponse } from "../../_shared/responses";
import { PRODUCT_DETAIL_SELECT, type ProductDetailReadClient } from "./data";
import { normalizeProductId } from "./product-id";
import { type ProductDetailResponseBody, toProductDetailResponse } from "./response";

export type { ProductDetailReadClient } from "./data";

// 建立商品詳細 API handler，只回傳啟用來源分類且仍有目前價格的公開商品資料。
export function createGetProductHandler(
  client: ProductDetailReadClient,
): (productId: string) => Promise<Response> {
  return async (productId) => {
    try {
      const normalizedProductId = normalizeProductId(productId);

      if (!normalizedProductId) {
        return notFoundResponse();
      }

      const product = await client.product.findFirst({
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

      if (!product) {
        return notFoundResponse();
      }

      return jsonOk<ProductDetailResponseBody>(toProductDetailResponse(product));
    } catch {
      return internalErrorResponse();
    }
  };
}
