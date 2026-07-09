// apps/web/app/api/product-images/[id]/route.ts
// 接上商品縮圖 API 的 Node.js runtime、圖片限流與 cached image handler。

import { withRateLimit } from "../../_shared/rate-limit";
import { createGetProductImageHandler } from "../handler";

export const runtime = "nodejs";

interface ProductImageRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, context: ProductImageRouteContext): Promise<Response> {
  return withRateLimit(request, "api:image", async () => {
    const { id } = await context.params;

    return createGetProductImageHandler()(id);
  });
}
