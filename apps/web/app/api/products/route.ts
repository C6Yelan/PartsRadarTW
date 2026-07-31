// apps/web/app/api/products/route.ts
// 接上商品列表 public API 的 list rate limit、Prisma read client 與 handler。

import {
  readBoundedProductMovementPage,
  readBoundedProductMovementSummaries,
} from "@partsradar/db/product-movement";
import { withRateLimit, type RateLimitScope } from "../_shared/rate-limit";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/data";
import type { ProductsReadClient } from "./data";
import { createGetProductsHandler } from "./handler";
import { isPriceMovementSort, parseProductListQuery } from "./query";

// 接收商品列表 GET request，並將 Prisma delegate 轉給 endpoint handler。
export async function GET(request: Request): Promise<Response> {
  return withRateLimit(request, selectProductsRateLimitScope(request), async () => {
    const { prisma } = await import("@partsradar/db");
    const client: ProductsReadClient = {
      product: {
        findProducts: (args) => prisma.product.findMany(args),
        findVendorOptions: (args) => prisma.product.findMany(args),
        count: (args) => prisma.product.count(args),
      },
      movement: {
        findPage: (args) =>
          readBoundedProductMovementPage(
            {
              $transaction: (callback, options) =>
                prisma.$transaction(
                  (transaction) =>
                    callback({
                      $queryRaw: (query) => transaction.$queryRaw(query),
                    }),
                  options,
                ),
            },
            args,
          ),
        findSummaries: (productIds, now) =>
          readBoundedProductMovementSummaries(
            {
              $transaction: (callback, options) =>
                prisma.$transaction(
                  (transaction) =>
                    callback({
                      $queryRaw: (query) => transaction.$queryRaw(query),
                    }),
                  options,
                ),
            },
            productIds,
            now,
          ),
      },
      sourceCategory: {
        findMany: () => prisma.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      },
    };

    return createGetProductsHandler(client)(request);
  });
}

export function selectProductsRateLimitScope(request: Request): RateLimitScope {
  try {
    const query = parseProductListQuery(new URL(request.url).searchParams);
    return isPriceMovementSort(query.sort) ? "api:list:movement" : "api:list";
  } catch {
    return "api:list";
  }
}
