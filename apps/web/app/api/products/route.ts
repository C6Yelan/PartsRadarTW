// apps/web/app/api/products/route.ts
// 接上商品列表 public API 的 list rate limit、Prisma read client 與 handler。

import { withRateLimit } from "../_shared/rate-limit";
import { createGetProductsHandler, type ProductsReadClient } from "./handler";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/handler";

// 接收商品列表 GET request，將 Prisma delegate 轉接給可測試的 handler。
export async function GET(request: Request): Promise<Response> {
  return withRateLimit(request, "api:list", async () => {
    const { prisma } = await import("@partsradar/db");
    const client: ProductsReadClient = {
      product: {
        findProducts: (args) => prisma.product.findMany(args),
        findVendorOptions: (args) => prisma.product.findMany(args),
        count: (args) => prisma.product.count(args),
      },
      priceSnapshot: {
        findMany: (args) => prisma.priceSnapshot.findMany(args),
      },
      sourceCategory: {
        findMany: () => prisma.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      },
    };

    return createGetProductsHandler(client)(request);
  });
}
