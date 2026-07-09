// apps/web/app/api/categories/route.ts
// 接上 categories public API 的 rate limit、Prisma client 與 handler。

import { withRateLimit } from "../_shared/rate-limit";
import { createGetCategoriesHandler } from "./handler";

export async function GET(request: Request): Promise<Response> {
  return withRateLimit(request, "api:read", async () => {
    const { prisma } = await import("@partsradar/db");

    return createGetCategoriesHandler(prisma)();
  });
}
