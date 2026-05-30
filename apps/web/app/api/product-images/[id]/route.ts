import { internalErrorResponse } from "../../_shared/responses";
import { createGetProductImageHandler } from "../handler";

export const runtime = "nodejs";

interface ProductImageRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  _request: Request,
  context: ProductImageRouteContext,
): Promise<Response> {
  try {
    const { id } = await context.params;

    return createGetProductImageHandler()(id);
  } catch {
    return internalErrorResponse();
  }
}
