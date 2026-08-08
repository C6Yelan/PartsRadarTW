// apps/web/app/products/sitemap.xml/data.ts
// 定義 product sitemap 的公開 eligibility 與只讀取 UUID 的窄查詢。

import type { Prisma } from "@partsradar/db";

export const PRODUCT_SITEMAP_QUERY = {
  where: {
    isExcluded: false,
    sourceCategory: {
      enabled: true,
    },
    currentPrice: {
      isNot: null,
    },
  },
  orderBy: {
    id: "asc",
  },
  select: {
    id: true,
  },
} as const satisfies Prisma.ProductFindManyArgs;

type ProductSitemapRecord = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_SITEMAP_QUERY.select;
}>;

export interface ProductSitemapReadClient {
  product: {
    findMany(args: typeof PRODUCT_SITEMAP_QUERY): Promise<ProductSitemapRecord[]>;
  };
}

export async function readPublicProductIds(client: ProductSitemapReadClient): Promise<string[]> {
  const products = await client.product.findMany(PRODUCT_SITEMAP_QUERY);

  return products.map(({ id }) => id);
}
