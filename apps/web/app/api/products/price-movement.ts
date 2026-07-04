// apps/web/app/api/products/price-movement.ts
import {
  PRODUCT_PRICE_MOVEMENT_SNAPSHOT_SELECT,
  PRODUCT_SELECT,
  type ProductRecord,
  type ProductsReadClient,
} from "./data";
import { buildProductOrderBy, isPriceMovementSort, type ProductListQuery } from "./query";
import {
  buildProductPriceMovementMap,
  type ProductPriceMovement,
} from "./response";

type ProductWhere = Parameters<ProductsReadClient["product"]["findProducts"]>[0]["where"];

export async function findProductsWithMovement(
  client: ProductsReadClient,
  where: ProductWhere,
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
      compareByPriceMovement(query.sort, left, right, priceMovementByProductId),
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

function compareByPriceMovement(
  sort: ProductListQuery["sort"],
  left: ProductRecord,
  right: ProductRecord,
  priceMovementByProductId: Map<string, ProductPriceMovement>,
) {
  if (sort === "price_rise_desc") {
    return compareByPriceRise(left, right, priceMovementByProductId);
  }

  return compareByPriceDrop(left, right, priceMovementByProductId);
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

function compareByPriceRise(
  left: ProductRecord,
  right: ProductRecord,
  priceMovementByProductId: Map<string, ProductPriceMovement>,
) {
  const leftMovement = priceMovementByProductId.get(left.id);
  const rightMovement = priceMovementByProductId.get(right.id);
  const leftHasRise = hasPriceRise(leftMovement);
  const rightHasRise = hasPriceRise(rightMovement);

  if (leftHasRise !== rightHasRise) {
    return leftHasRise ? -1 : 1;
  }

  if (leftHasRise && rightHasRise && leftMovement && rightMovement) {
    const percentOrder = (rightMovement.deltaPercent ?? 0) - (leftMovement.deltaPercent ?? 0);

    if (percentOrder !== 0) {
      return percentOrder;
    }

    const amountOrder = (rightMovement.deltaAmount ?? 0) - (leftMovement.deltaAmount ?? 0);

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

function hasPriceRise(movement: ProductPriceMovement | undefined) {
  return (
    movement?.deltaAmount !== null &&
    movement?.deltaAmount !== undefined &&
    movement.deltaAmount > 0 &&
    movement.deltaPercent !== null &&
    movement.deltaPercent !== undefined &&
    movement.deltaPercent > 0
  );
}
