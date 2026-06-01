import { checkRateLimit } from "../../../_shared/rate-limit";
import { internalErrorResponse } from "../../../_shared/responses";
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
  try {
    const rateLimitResponse = checkRateLimit(request, "api:read");

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

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
  } catch {
    return internalErrorResponse();
  }
}
