// apps/web/app/api/source-status/route.ts
import { withRateLimit } from "../_shared/rate-limit";
import {
  createGetSourceStatusHandler,
  SOURCE_STATUS_CATEGORY_QUERY,
  type SourceStatusReadClient,
} from "./handler";

export async function GET(request: Request): Promise<Response> {
  return withRateLimit(request, "api:read", async () => {
    const { prisma } = await import("@partsradar/db");
    const client: SourceStatusReadClient = {
      sourceCategory: {
        findMany: () => prisma.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      },
    };

    return createGetSourceStatusHandler(client)();
  });
}
