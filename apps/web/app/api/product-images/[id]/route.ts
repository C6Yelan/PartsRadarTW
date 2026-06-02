// apps/web/app/api/product-images/[id]/route.ts
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
