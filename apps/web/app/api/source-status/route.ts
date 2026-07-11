// apps/web/app/api/source-status/route.ts
// 接上來源狀態 public API 的 rate limit、Prisma read client 與 handler。

import { withRateLimit } from "../_shared/rate-limit";
import { SOURCE_STATUS_CATEGORY_QUERY, type SourceStatusReadClient } from "./data";
import { createGetSourceStatusHandler } from "./handler";

// 接收來源狀態 GET request，並將 Prisma delegate 轉給 endpoint handler。
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
