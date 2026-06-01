import { checkRateLimit } from "../_shared/rate-limit";
import { internalErrorResponse } from "../_shared/responses";
import {
  createGetSourceStatusHandler,
  SOURCE_STATUS_CATEGORY_QUERY,
  type SourceStatusReadClient,
} from "./handler";

export async function GET(request: Request): Promise<Response> {
  try {
    const rateLimitResponse = checkRateLimit(request, "api:read");

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { prisma } = await import("@partsradar/db");
    const client: SourceStatusReadClient = {
      sourceCategory: {
        findMany: () => prisma.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      },
    };

    return createGetSourceStatusHandler(client)();
  } catch {
    return internalErrorResponse();
  }
}
