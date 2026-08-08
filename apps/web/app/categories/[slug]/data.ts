// apps/web/app/categories/[slug]/data.ts
// 以既有 category mapping 與 public product query 組出 bounded category landing data。

import type { Prisma } from "@partsradar/db";
import { cache } from "react";
import {
  PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
  PRODUCT_SELECT,
  type ProductListFindManyArgs,
  type ProductRecord,
} from "../../api/products/data";
import {
  buildProductOrderBy,
  buildProductWhere,
  parseProductListQuery,
} from "../../api/products/query";
import {
  type ProductsResponseBody,
  toProductResponseItemWithMovement,
} from "../../api/products/response";
import { type CategorySlug, getCategoryIgrp, getCategorySlug } from "../../category-slugs";

export const CATEGORY_LANDING_PRODUCT_LIMIT = 20;

const CATEGORY_LANDING_SELECT = {
  id: true,
  igrp: true,
  displayName: true,
  sourceName: true,
  lastSuccessAt: true,
} as const satisfies Prisma.SourceCategorySelect;

type CategoryLandingRecord = Prisma.SourceCategoryGetPayload<{
  select: typeof CATEGORY_LANDING_SELECT;
}>;
type CategoryLandingFindFirstArgs = Omit<Prisma.SourceCategoryFindFirstArgs, "select"> & {
  select: typeof CATEGORY_LANDING_SELECT;
};

export interface CategoryLandingReadClient {
  sourceCategory: {
    findFirst(args: CategoryLandingFindFirstArgs): Promise<CategoryLandingRecord | null>;
  };
  product: {
    findMany(args: ProductListFindManyArgs): Promise<ProductRecord[]>;
  };
}

export interface CategoryLandingData {
  category: CategoryLandingRecord & { slug: CategorySlug };
  products: ProductsResponseBody["data"];
}

export async function findCategoryLanding(
  client: CategoryLandingReadClient,
  slug: string,
): Promise<CategoryLandingData | null> {
  const igrp = getCategoryIgrp(slug);

  if (igrp === null) {
    return null;
  }
  const categorySlug = getCategorySlug(igrp);

  if (!categorySlug) {
    return null;
  }

  const category = await client.sourceCategory.findFirst({
    where: {
      enabled: true,
      igrp,
    },
    select: CATEGORY_LANDING_SELECT,
  });

  if (!category) {
    return null;
  }

  const query = parseProductListQuery(
    new URLSearchParams({
      category: slug,
      page: "1",
      pageSize: String(CATEGORY_LANDING_PRODUCT_LIMIT),
      sort: "price_asc",
      status: "active",
    }),
  );
  const products = await client.product.findMany({
    where: buildProductWhere(query, { includeVendors: true }),
    orderBy: buildProductOrderBy(query.sort),
    take: CATEGORY_LANDING_PRODUCT_LIMIT,
    select: PRODUCT_SELECT,
  });

  return {
    category: {
      ...category,
      slug: categorySlug,
    },
    products: products.map((product) =>
      toProductResponseItemWithMovement(product, {
        rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
        deltaAmount: null,
        deltaPercent: null,
      }),
    ),
  };
}

export const getCategoryLanding = cache(async (slug: string) => {
  const { prisma } = await import("@partsradar/db");
  const client: CategoryLandingReadClient = {
    sourceCategory: {
      findFirst: (args) => prisma.sourceCategory.findFirst(args),
    },
    product: {
      findMany: (args) => prisma.product.findMany(args),
    },
  };

  return findCategoryLanding(client, slug);
});
