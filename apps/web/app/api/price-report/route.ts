// apps/web/app/api/price-report/route.ts
// 接上公開價格報告的 list rate limit、Prisma read delegates 與 handler。

import type { Prisma, PrismaClient } from "@partsradar/db";

import { withRateLimit } from "../_shared/rate-limit";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../source-status/data";
import { createGetPriceReportHandler, type PriceReportApiReadClient } from "./handler";

export async function GET(request: Request): Promise<Response> {
  const { prisma } = await import("@partsradar/db");
  return handleGetPriceReportRoute(request, prisma);
}

export function handleGetPriceReportRoute(
  request: Request,
  prisma: PrismaClient,
): Promise<Response> {
  return withRateLimit(request, "api:list", async () => {
    return createGetPriceReportHandler(createPriceReportApiReadClient(prisma))(request);
  });
}

export function createPriceReportApiReadClient(prisma: PrismaClient): PriceReportApiReadClient {
  return {
    priceSnapshot: prisma.priceSnapshot,
    $queryRaw: <T>(query: Prisma.Sql) => prisma.$queryRaw<T>(query),
    product: {
      findMany: (args) => prisma.product.findMany(args),
    },
    sourceCategory: {
      findMany: () => prisma.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
    },
  };
}
