// apps/web/app/api/products/[id]/price-history/route.ts
// 提供商品價格歷史 API 的 Next.js route 接線，套用讀取限流並注入 Prisma read client。

import { withRateLimit } from "../../../_shared/rate-limit";
import type { ProductPriceHistoryReadClient } from "./data";
import { createGetProductPriceHistoryHandler } from "./handler";

interface ProductPriceHistoryRouteContext {
  params: Promise<{
    id: string;
  }>;
}

// 接收商品價格歷史 GET request，並將 route context 轉給 endpoint handler。
export async function GET(
  request: Request,
  context: ProductPriceHistoryRouteContext,
): Promise<Response> {
  return withRateLimit(request, "api:read", async () => {
    const { id } = await context.params;
    const { prisma } = await import("@partsradar/db");
    const client: ProductPriceHistoryReadClient = {
      product: {
        findFirst: (args) => prisma.product.findFirst(args),
      },
      priceSnapshot: {
        findMany: (args) => prisma.priceSnapshot.findMany(args),
      },
    };

    return createGetProductPriceHistoryHandler(client)(id, request.url);
  });
}
