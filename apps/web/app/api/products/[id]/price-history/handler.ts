// apps/web/app/api/products/[id]/price-history/handler.ts
// 處理商品價格歷史 API 的 product id 驗證、range query 解析、DB 讀取與安全回應。

import { InvalidQueryError } from "../../../_shared/query";
import {
  internalErrorResponse,
  invalidQueryResponse,
  jsonOk,
  notFoundResponse,
} from "../../../_shared/responses";
import { normalizeProductId } from "../product-id";
import {
  PRICE_HISTORY_PRODUCT_SELECT,
  PRICE_HISTORY_SNAPSHOT_SELECT,
  type ProductPriceHistoryReadClient,
} from "./data";
import { parsePriceHistoryRange, PRICE_HISTORY_MILLISECONDS_PER_DAY } from "./query";
import { type ProductPriceHistoryResponseBody, toPriceHistoryResponse } from "./response";

export type { ProductPriceHistoryReadClient } from "./data";

interface ProductPriceHistoryHandlerOptions {
  now?: Date;
}

// 建立商品價格歷史 handler；不合法 id/query 會在讀 DB 前中止，避免無效請求觸發資料查詢。
export function createGetProductPriceHistoryHandler(
  client: ProductPriceHistoryReadClient,
  options: ProductPriceHistoryHandlerOptions = {},
): (productId: string, requestUrl: string) => Promise<Response> {
  return async (productId, requestUrl) => {
    try {
      const normalizedProductId = normalizeProductId(productId);

      if (!normalizedProductId) {
        return notFoundResponse();
      }

      const range = parsePriceHistoryRange(new URL(requestUrl).searchParams);
      const now = options.now ?? new Date();
      const since =
        range.days === null
          ? null
          : new Date(now.getTime() - range.days * PRICE_HISTORY_MILLISECONDS_PER_DAY);
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
        select: PRICE_HISTORY_PRODUCT_SELECT,
      });

      if (!product) {
        return notFoundResponse();
      }

      const snapshots = await client.priceSnapshot.findMany({
        where: {
          productId: normalizedProductId,
          ...(since
            ? {
                capturedAt: {
                  gte: since,
                },
              }
            : {}),
        },
        orderBy: {
          capturedAt: "asc",
        },
        select: PRICE_HISTORY_SNAPSHOT_SELECT,
      });

      return jsonOk<ProductPriceHistoryResponseBody>(
        toPriceHistoryResponse(range, snapshots, product, since),
      );
    } catch (error) {
      if (error instanceof InvalidQueryError) {
        return invalidQueryResponse();
      }

      return internalErrorResponse();
    }
  };
}
