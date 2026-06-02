import { withRateLimit } from "../_shared/rate-limit";
import { createGetProductsHandler, type ProductsReadClient } from "./handler";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/handler";

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
