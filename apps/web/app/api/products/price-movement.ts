// apps/web/app/api/products/price-movement.ts
// 協調一般列表的逐頁 movement 摘要，以及由 DB 排序的 bounded movement pages。

import { ProductMovementReadUnavailableError } from "@partsradar/db/product-movement";

import {
  PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
  PRODUCT_SELECT,
  type ProductRecord,
  type ProductsReadClient,
} from "./data";
import { buildProductOrderBy, isPriceMovementSort, type ProductListQuery } from "./query";
import type { ProductPriceMovement } from "./response";

type ProductWhere = Parameters<ProductsReadClient["product"]["findProducts"]>[0]["where"];

export async function findProductsWithMovement(
  client: ProductsReadClient,
  where: ProductWhere,
  query: ProductListQuery,
  now: Date,
): Promise<{
  priceMovementByProductId: Map<string, ProductPriceMovement>;
  products: ProductRecord[];
  totalItems: number | null;
}> {
  if (isPriceMovementSort(query.sort)) {
    const movementPage = await client.movement.findPage({
      filters: {
        facetTags: query.facetTags,
        igrp: query.igrp,
        maxPrice: query.maxPrice,
        minPrice: query.minPrice,
        q: query.q,
        status: query.status,
        vendors: query.vendors,
      },
      now,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
    });
    const products =
      movementPage.productIds.length === 0
        ? []
        : await client.product.findProducts({
            where: { AND: [where ?? {}, { id: { in: movementPage.productIds } }] },
            select: PRODUCT_SELECT,
          });
    const productById = new Map(products.map((product) => [product.id, product]));
    const orderedProducts = movementPage.productIds.map((productId) => productById.get(productId));

    if (orderedProducts.some((product) => product === undefined)) {
      throw new ProductMovementReadUnavailableError();
    }

    return {
      products: orderedProducts as ProductRecord[],
      priceMovementByProductId: toMovementMap(movementPage.summaries),
      totalItems: movementPage.totalItems,
    };
  }

  const requestedOffset = (query.page - 1) * query.pageSize;
  const products =
    !Number.isSafeInteger(requestedOffset)
      ? []
      : await client.product.findProducts({
          where,
          orderBy: buildProductOrderBy(query.sort),
          skip: requestedOffset,
          take: query.pageSize,
          select: PRODUCT_SELECT,
        });
  const summaries = await client.movement.findSummaries(
    products.map((product) => product.id),
    now,
  );

  return {
    products,
    priceMovementByProductId: toMovementMap(summaries),
    totalItems: null,
  };
}

function toMovementMap(
  summaries: ReadonlyArray<{
    deltaAmount: number | null;
    deltaPercent: number | null;
    productId: string;
  }>,
): Map<string, ProductPriceMovement> {
  return new Map(
    summaries.map((summary) => [
      summary.productId,
      {
        rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
        deltaAmount: summary.deltaAmount,
        deltaPercent: summary.deltaPercent,
      },
    ]),
  );
}
