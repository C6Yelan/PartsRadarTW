// apps/web/app/api/build-list/refresh/handler.ts
// 處理配單批次 refresh validation、單次資料查詢、request-order response 與安全錯誤。

import { internalErrorResponse, invalidRequestResponse, jsonOk } from "../../_shared/responses";
import { BUILD_LIST_REFRESH_SELECT, type BuildListRefreshReadClient } from "./data";
import { type BuildListRefreshResponseBody, toBuildListRefreshProduct } from "./response";
import { parseBuildListRefreshRequest } from "./validation";

export function createPostBuildListRefreshHandler(
  client: BuildListRefreshReadClient,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const productIds = await parseBuildListRefreshRequest(request);

      if (!productIds) {
        return invalidRequestResponse();
      }

      if (productIds.length === 0) {
        return jsonOk<BuildListRefreshResponseBody>({ data: [], missingProductIds: [] });
      }

      const products = await client.product.findMany({
        where: {
          id: {
            in: productIds,
          },
          sourceCategory: {
            enabled: true,
          },
        },
        select: BUILD_LIST_REFRESH_SELECT,
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      const data = productIds.flatMap((productId) => {
        const product = productsById.get(productId);

        return product ? [toBuildListRefreshProduct(product)] : [];
      });
      const missingProductIds = productIds.filter((productId) => !productsById.has(productId));

      return jsonOk<BuildListRefreshResponseBody>({ data, missingProductIds });
    } catch {
      return internalErrorResponse();
    }
  };
}
