import { checkRateLimit } from "../_shared/rate-limit";
import { internalErrorResponse } from "../_shared/responses";
import { createGetCategoriesHandler } from "./handler";

export async function GET(request: Request): Promise<Response> {
  try {
    const rateLimitResponse = checkRateLimit(request, "api:read");

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { prisma } = await import("@partsradar/db");

    return createGetCategoriesHandler(prisma)();
  } catch {
    return internalErrorResponse();
  }
}
