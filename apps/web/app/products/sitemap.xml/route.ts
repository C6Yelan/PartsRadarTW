// apps/web/app/products/sitemap.xml/route.ts
// 以 request-driven Data Cache 發布公開商品 sitemap，避免 build stage 連線 DB。

import { unstable_cache } from "next/cache";
import { readPublicProductIds } from "./data";
import { createProductSitemapResponse, PRODUCT_SITEMAP_REVALIDATE_SECONDS } from "./response";

export const dynamic = "force-dynamic";

const readCachedPublicProductIds = unstable_cache(
  async () => {
    const { prisma } = await import("@partsradar/db");

    return readPublicProductIds(prisma);
  },
  ["public-product-sitemap-ids-v1"],
  { revalidate: PRODUCT_SITEMAP_REVALIDATE_SECONDS },
);

export async function GET(): Promise<Response> {
  return createProductSitemapResponse(readCachedPublicProductIds);
}
