// apps/web/app/api/price-report/route.ts
// 接上公開價格報告的 list rate limit、Prisma read delegates 與 handler。

import { withRateLimit } from "../_shared/rate-limit";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/data";
import { createGetPriceReportHandler, type PriceReportApiReadClient } from "./handler";

export async function GET(request: Request): Promise<Response> {
  return withRateLimit(request, "api:list", async () => {
    const { prisma } = await import("@partsradar/db");
    const client: PriceReportApiReadClient = {
      priceSnapshot: prisma.priceSnapshot,
      product: {
        findMany: (args) => prisma.product.findMany(args),
      },
      sourceCategory: {
        findMany: () => prisma.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      },
    };

    return createGetPriceReportHandler(client)(request);
  });
}
