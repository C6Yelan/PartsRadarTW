// apps/web/app/api/products/handler.ts
// 處理商品列表 API 的 query 解析、品牌選項、價格變動排序、來源狀態與分頁回應。

import { InvalidQueryError } from "../_shared/query";
import { internalErrorResponse, invalidQueryResponse, jsonOk } from "../_shared/responses";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/handler";
import {
  PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
  PRODUCT_VENDOR_SELECT,
  type ProductsReadClient,
} from "./data";
import { findProductsWithMovement } from "./price-movement";
import {
  buildProductVendorOptionsWhere,
  buildProductWhere,
  parseProductListQuery,
  toProductVendorOptions,
  validateVendorValues,
} from "./query";
import {
  buildProductSourceStatus,
  type ProductsResponseBody,
  toProductResponseItemWithMovement,
} from "./response";

export type { ProductsReadClient } from "./data";

interface GetProductsHandlerOptions {
  now?: () => Date;
}

// 建立商品列表 API handler，將公開 query 轉成 DB 查詢並組裝列表、pagination 與 meta。
export function createGetProductsHandler(
  client: ProductsReadClient,
  options: GetProductsHandlerOptions = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const now = options.now?.() ?? new Date();
      const query = parseProductListQuery(new URL(request.url).searchParams);
      const [vendorRecords, sourceStatusCategories] = await Promise.all([
        query.igrp === undefined
          ? Promise.resolve([])
          : client.product.findVendorOptions({
              where: buildProductVendorOptionsWhere(query.igrp),
              orderBy: [{ vendorName: "asc" }, { vendorSlug: "asc" }],
              distinct: ["vendorSlug"],
              select: PRODUCT_VENDOR_SELECT,
            }),
        client.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      ]);
      const vendorOptions = toProductVendorOptions(vendorRecords);
      validateVendorValues(query.vendors, vendorOptions);
      const where = buildProductWhere(query, { includeVendors: true });
      const [totalItems, productsWithMovement] = await Promise.all([
        client.product.count({ where }),
        findProductsWithMovement(client, where, query, now),
      ]);
      const { priceMovementByProductId, products } = productsWithMovement;
      const sourceStatus = buildProductSourceStatus(sourceStatusCategories, query.igrp, now);

      return jsonOk<ProductsResponseBody>({
        data: products.map((product) =>
          toProductResponseItemWithMovement(
            product,
            priceMovementByProductId.get(product.id) ?? {
              rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
              deltaAmount: null,
              deltaPercent: null,
            },
          ),
        ),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / query.pageSize),
        },
        meta: {
          sourceStatus: sourceStatus.status,
          lastSuccessAt: sourceStatus.lastSuccessAt,
          vendors: vendorOptions,
        },
      });
    } catch (error) {
      if (error instanceof InvalidQueryError) {
        return invalidQueryResponse();
      }

      return internalErrorResponse();
    }
  };
}
