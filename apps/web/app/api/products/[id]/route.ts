import { withRateLimit } from "../../_shared/rate-limit";
import { createGetProductHandler, type ProductDetailReadClient } from "./handler";

interface ProductRouteContext {
  params: Promise<{
    id: string;
  }>;
}

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
