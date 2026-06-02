import { InvalidQueryError } from "../_shared/query";
import { internalErrorResponse, invalidQueryResponse, jsonOk } from "../_shared/responses";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/handler";
import {
  PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
  PRODUCT_PRICE_MOVEMENT_SNAPSHOT_SELECT,
  PRODUCT_SELECT,
  PRODUCT_VENDOR_SELECT,
  type ProductsReadClient,
} from "./data";
import {
  buildProductOrderBy,
  buildProductVendorOptionsWhere,
  buildProductWhere,
  parseProductListQuery,
  toProductVendorOptions,
  validateVendorValues,
} from "./query";
import {
  buildProductPriceMovementMap,
  buildProductSourceStatus,
  type ProductsResponseBody,
  toProductResponseItemWithMovement,
} from "./response";

export type { ProductsReadClient } from "./data";

interface GetProductsHandlerOptions {
  now?: () => Date;
}

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
      const [products, totalItems] = await Promise.all([
        client.product.findProducts({
          where,
          orderBy: buildProductOrderBy(query.sort),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: PRODUCT_SELECT,
        }),
        client.product.count({ where }),
      ]);
      const productIds = products.map((product) => product.id);
      const movementSnapshots =
        productIds.length === 0
          ? []
          : await client.priceSnapshot.findMany({
              where: {
                productId: {
                  in: productIds,
                },
                capturedAt: {
                  lte: now,
                },
              },
              orderBy: [{ productId: "asc" }, { capturedAt: "asc" }],
              select: PRODUCT_PRICE_MOVEMENT_SNAPSHOT_SELECT,
            });
      const priceMovementByProductId = buildProductPriceMovementMap(
        products,
        movementSnapshots,
        now,
      );
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
