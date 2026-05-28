import { internalErrorResponse } from "../_shared/responses";
import { createGetProductsHandler, type ProductsReadClient } from "./handler";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/handler";

export async function GET(request: Request): Promise<Response> {
  try {
    const { prisma } = await import("@partsradar/db");
    const client: ProductsReadClient = {
      product: {
        findMany: (args) => prisma.product.findMany(args),
        count: (args) => prisma.product.count(args),
      },
      sourceCategory: {
        findMany: () => prisma.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      },
    };

    return createGetProductsHandler(client)(request);
  } catch {
    return internalErrorResponse();
  }
}
