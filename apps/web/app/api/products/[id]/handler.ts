// apps/web/app/api/products/[id]/handler.ts
// 處理商品詳細 API 的商品 id 正規化、公開查詢條件與安全 JSON 回應。

import { internalErrorResponse, jsonOk, notFoundResponse } from "../../_shared/responses";
import { findPublicProductDetail, type ProductDetailReadClient } from "./data";
import { type ProductDetailResponseBody, toProductDetailResponse } from "./response";

// 建立商品詳細 API handler，只回傳啟用來源分類且仍有目前價格的公開商品資料。
export function createGetProductHandler(
  client: ProductDetailReadClient,
): (productId: string) => Promise<Response> {
  return async (productId) => {
    try {
      const product = await findPublicProductDetail(client, productId);

      if (!product) {
        return notFoundResponse();
      }

      return jsonOk<ProductDetailResponseBody>(toProductDetailResponse(product));
    } catch {
      return internalErrorResponse();
    }
  };
}
