import { checkRateLimit } from "../../_shared/rate-limit";
import { internalErrorResponse } from "../../_shared/responses";
import { createGetProductImageHandler } from "../handler";

export const runtime = "nodejs";

interface ProductImageRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, context: ProductImageRouteContext): Promise<Response> {
  try {
    const rateLimitResponse = checkRateLimit(request, "api:image");

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { id } = await context.params;

    return createGetProductImageHandler()(id);
  } catch {
    return internalErrorResponse();
  }
}
