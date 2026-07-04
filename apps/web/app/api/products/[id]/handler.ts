// apps/web/app/api/products/[id]/handler.ts
import { internalErrorResponse, jsonOk, notFoundResponse } from "../../_shared/responses";
import { PRODUCT_DETAIL_SELECT, type ProductDetailReadClient } from "./data";
import { normalizeProductId } from "./product-id";
import { type ProductDetailResponseBody, toProductDetailResponse } from "./response";

export type { ProductDetailReadClient } from "./data";

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
