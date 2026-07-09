// apps/web/app/api/products/[id]/route.ts
// 提供商品詳細 API 的 Next.js route 接線，套用讀取限流並注入 Prisma read client。

import { withRateLimit } from "../../_shared/rate-limit";
import { createGetProductHandler, type ProductDetailReadClient } from "./handler";

interface ProductRouteContext {
  params: Promise<{
    id: string;
  }>;
}

// 接收商品詳細 GET request，將 route id 與 Prisma delegate 轉接給可測試的 handler。
export async function GET(request: Request, context: ProductRouteContext): Promise<Response> {
  return withRateLimit(request, "api:read", async () => {
    const { id } = await context.params;
    const { prisma } = await import("@partsradar/db");
    const client: ProductDetailReadClient = {
      product: {
        findFirst: (args) => prisma.product.findFirst(args),
      },
    };

    return createGetProductHandler(client)(id);
  });
}
