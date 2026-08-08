// apps/web/app/sitemap.ts
// 列出不含使用者狀態或查詢參數的穩定公開頁面與 eligible 商品頁。

import type { Prisma } from "@partsradar/db";
import type { MetadataRoute } from "next";
import { resolvePublicSiteUrl } from "./_shared/public-site";
import { buildDefaultProductListWhere } from "./api/products/query";

export const dynamic = "force-dynamic";

const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/price-report",
  "/discord",
  "/about",
  "/announcements",
  "/privacy",
  "/terms",
] as const;

const MAX_SITEMAP_URLS = 50_000;
export const PRODUCT_SITEMAP_LIMIT = MAX_SITEMAP_URLS - PUBLIC_SITEMAP_PATHS.length;

const PRODUCT_SITEMAP_SELECT = {
  id: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
    },
  },
} as const satisfies Prisma.ProductSelect;

type ProductSitemapRecord = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_SITEMAP_SELECT;
}>;
type ProductSitemapFindManyArgs = Omit<Prisma.ProductFindManyArgs, "select"> & {
  select: typeof PRODUCT_SITEMAP_SELECT;
};

export interface SitemapReadClient {
  product: {
    findMany(args: ProductSitemapFindManyArgs): Promise<ProductSitemapRecord[]>;
  };
}

interface SitemapOptions {
  publicSiteUrl?: string | null;
}

export async function createSitemap(
  client: SitemapReadClient,
  options: SitemapOptions = {},
): Promise<MetadataRoute.Sitemap> {
  const publicSiteUrl = resolvePublicSiteUrl(options.publicSiteUrl);
  const products = await client.product.findMany({
    where: buildDefaultProductListWhere(),
    orderBy: {
      id: "asc",
    },
    take: PRODUCT_SITEMAP_LIMIT,
    select: PRODUCT_SITEMAP_SELECT,
  });

  const publicEntries = PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: new URL(path, `${publicSiteUrl}/`).toString(),
  }));
  const productEntries = products.flatMap((product) =>
    product.currentPrice
      ? [
          {
            url: new URL(`/products/${product.id}`, `${publicSiteUrl}/`).toString(),
            lastModified: product.currentPrice.lastSeenAt,
          },
        ]
      : [],
  );

  return [...publicEntries, ...productEntries];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { prisma } = await import("@partsradar/db");
  const client: SitemapReadClient = {
    product: {
      findMany: (args) => prisma.product.findMany(args),
    },
  };

  return createSitemap(client);
}
