// apps/web/app/api/products/[id]/price-history/route.ts
import { withRateLimit } from "../../../_shared/rate-limit";
import {
  createGetProductPriceHistoryHandler,
  type ProductPriceHistoryReadClient,
} from "./handler";

interface ProductPriceHistoryRouteContext {
  params: Promise<{
    id: string;
  }>;
}

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
