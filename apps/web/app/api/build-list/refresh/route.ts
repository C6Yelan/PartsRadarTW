// apps/web/app/api/build-list/refresh/route.ts
// 提供配單批次 refresh POST route，套用獨立限流並注入 Prisma read client。

import { withRateLimit } from "../../_shared/rate-limit";
import type { BuildListRefreshReadClient } from "./data";
import { createPostBuildListRefreshHandler } from "./handler";

export async function POST(request: Request): Promise<Response> {
  return withRateLimit(request, "api:build-list", async () => {
    const { prisma } = await import("@partsradar/db");
    const client: BuildListRefreshReadClient = {
      product: {
        findMany: (args) => prisma.product.findMany(args),
      },
    };

    return createPostBuildListRefreshHandler(client)(request);
  });
}
