import { internalErrorResponse } from "../../_shared/responses";
import { createGetProductHandler, type ProductDetailReadClient } from "./handler";

interface ProductRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: ProductRouteContext): Promise<Response> {
  try {
    const { id } = await context.params;
    const { prisma } = await import("@partsradar/db");
    const client: ProductDetailReadClient = {
      product: {
        findFirst: (args) => prisma.product.findFirst(args),
      },
    };

    return createGetProductHandler(client)(id);
  } catch {
    return internalErrorResponse();
  }
}
