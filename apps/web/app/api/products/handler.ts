import { InvalidQueryError } from "../_shared/query";
import { internalErrorResponse, invalidQueryResponse, jsonOk } from "../_shared/responses";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/handler";
import {
  PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
  PRODUCT_PRICE_MOVEMENT_SNAPSHOT_SELECT,
  PRODUCT_SELECT,
  PRODUCT_VENDOR_SELECT,
  type ProductRecord,
  type ProductsReadClient,
} from "./data";
import {
  buildProductOrderBy,
  buildProductVendorOptionsWhere,
  buildProductWhere,
  isPriceMovementSort,
  parseProductListQuery,
  type ProductListQuery,
  toProductVendorOptions,
  validateVendorValues,
} from "./query";
import {
  buildProductPriceMovementMap,
  buildProductSourceStatus,
  type ProductPriceMovement,
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

async function findProductsWithMovement(
  client: ProductsReadClient,
  where: Parameters<ProductsReadClient["product"]["findProducts"]>[0]["where"],
  query: ProductListQuery,
  now: Date,
) {
  if (isPriceMovementSort(query.sort)) {
    const allProducts = await client.product.findProducts({
      where,
      orderBy: buildProductOrderBy(query.sort),
      select: PRODUCT_SELECT,
    });
    const movementSnapshots = await findPriceMovementSnapshots(client, allProducts, now);
    const priceMovementByProductId = buildProductPriceMovementMap(
      allProducts,
      movementSnapshots,
      now,
    );
    const sortedProducts = [...allProducts].sort((left, right) =>
      compareByPriceDrop(left, right, priceMovementByProductId),
    );
    const pageStart = (query.page - 1) * query.pageSize;

    return {
      products: sortedProducts.slice(pageStart, pageStart + query.pageSize),
      priceMovementByProductId,
    };
  }

  const products = await client.product.findProducts({
    where,
    orderBy: buildProductOrderBy(query.sort),
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    select: PRODUCT_SELECT,
  });
  const movementSnapshots = await findPriceMovementSnapshots(client, products, now);

  return {
    products,
    priceMovementByProductId: buildProductPriceMovementMap(products, movementSnapshots, now),
  };
}

async function findPriceMovementSnapshots(
  client: ProductsReadClient,
  products: ProductRecord[],
  now: Date,
) {
  const productIds = products.map((product) => product.id);

  return productIds.length === 0
    ? []
    : client.priceSnapshot.findMany({
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
}

function compareByPriceDrop(
  left: ProductRecord,
  right: ProductRecord,
  priceMovementByProductId: Map<string, ProductPriceMovement>,
) {
  const leftMovement = priceMovementByProductId.get(left.id);
  const rightMovement = priceMovementByProductId.get(right.id);
  const leftHasDrop = hasPriceDrop(leftMovement);
  const rightHasDrop = hasPriceDrop(rightMovement);

  if (leftHasDrop !== rightHasDrop) {
    return leftHasDrop ? -1 : 1;
  }

  if (leftHasDrop && rightHasDrop && leftMovement && rightMovement) {
    const percentOrder = (leftMovement.deltaPercent ?? 0) - (rightMovement.deltaPercent ?? 0);

    if (percentOrder !== 0) {
      return percentOrder;
    }

    const amountOrder = (leftMovement.deltaAmount ?? 0) - (rightMovement.deltaAmount ?? 0);

    if (amountOrder !== 0) {
      return amountOrder;
    }
  }

  return left.id.localeCompare(right.id);
}

function hasPriceDrop(movement: ProductPriceMovement | undefined) {
  return (
    movement?.deltaAmount !== null &&
    movement?.deltaAmount !== undefined &&
    movement.deltaAmount < 0 &&
    movement.deltaPercent !== null &&
    movement.deltaPercent !== undefined &&
    movement.deltaPercent < 0
  );
}
