// apps/web/tests/categories/landing-pages.test.tsx
// 驗證正式 category slugs、bounded public product query、metadata 與 server-rendered links。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CategoryLanding from "../../app/categories/[slug]/category-landing";
import {
  CATEGORY_LANDING_PRODUCT_LIMIT,
  type CategoryLandingReadClient,
  findCategoryLanding,
} from "../../app/categories/[slug]/data";
import { buildCategoryMetadata } from "../../app/categories/[slug]/metadata";
import CategoryDirectory from "../../app/categories/CategoryDirectory";
import { CATEGORY_MAPPINGS } from "../../app/category-slugs";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const LAST_SUCCESS_AT = new Date("2026-08-08T08:30:00.000Z");

describe("category landing pages", () => {
  it("publishes a standard homepage link for every formal category slug", () => {
    const html = renderToStaticMarkup(<CategoryDirectory />);

    for (const category of CATEGORY_MAPPINGS) {
      expect(html).toContain(`href="/categories/${category.slug}"`);
      expect(html).toContain(category.label);
    }
  });

  it.each(CATEGORY_MAPPINGS)("loads bounded public products for $slug", async (mapping) => {
    const client = fakeCategoryLandingClient(mapping.igrp, mapping.label);
    const data = await findCategoryLanding(client, mapping.slug);

    expect(data?.category).toMatchObject({
      igrp: mapping.igrp,
      slug: mapping.slug,
      displayName: mapping.label,
    });
    expect(data?.products).toHaveLength(1);
    expect(client.lastCategoryFindFirstArgs).toMatchObject({
      where: { enabled: true, igrp: mapping.igrp },
    });
    expect(client.lastProductFindManyArgs).toMatchObject({
      where: {
        isActive: true,
        isExcluded: false,
        sourceCategory: { enabled: true, igrp: mapping.igrp },
        currentPrice: {
          is: {
            priceSnapshot: {
              price: {},
            },
          },
        },
      },
      orderBy: [{ currentPrice: { priceSnapshot: { price: "asc" } } }, { id: "asc" }],
      take: CATEGORY_LANDING_PRODUCT_LIMIT,
    });
  });

  it("renders category-specific metadata, update context, and canonical product links", async () => {
    const data = await findCategoryLanding(fakeCategoryLandingClient(4, "CPU"), "cpu");
    expect(data).not.toBeNull();
    if (!data) return;

    const metadata = buildCategoryMetadata(data);
    const html = renderToStaticMarkup(<CategoryLanding data={data} />);

    expect(metadata.title).toBe("CPU 電腦零件價格 | PartsRadarTW");
    expect(metadata.description).toContain("資料整理自原價屋公開頁面");
    expect(metadata.alternates?.canonical).toBe("/categories/cpu");
    expect(html).toContain("CPU 商品價格");
    expect(html).toContain("測試 CPU 商品");
    expect(html).toContain(`href="/products/${PRODUCT_ID}"`);
    expect(html).toContain("NT$ 6,990");
    expect(html).toContain("分類資料最近成功更新");
    expect(html).toContain("原價屋公開頁面");
  });

  it("rejects unknown slugs without reading the database", async () => {
    const client = fakeCategoryLandingClient(4, "CPU");

    await expect(findCategoryLanding(client, "unknown-category")).resolves.toBeNull();
    expect(client.categoryFindFirstCallCount).toBe(0);
    expect(client.productFindManyCallCount).toBe(0);
  });
});

type CategoryFindFirstArgs = Parameters<
  CategoryLandingReadClient["sourceCategory"]["findFirst"]
>[0];
type ProductFindManyArgs = Parameters<CategoryLandingReadClient["product"]["findMany"]>[0];
type CategoryRecord = Awaited<ReturnType<CategoryLandingReadClient["sourceCategory"]["findFirst"]>>;
type ProductRecord = Awaited<ReturnType<CategoryLandingReadClient["product"]["findMany"]>>[number];

function fakeCategoryLandingClient(igrp: number, displayName: string) {
  const category: NonNullable<CategoryRecord> = {
    id: `category-${igrp}`,
    igrp,
    displayName,
    sourceName: `${displayName} source`,
    lastSuccessAt: LAST_SUCCESS_AT,
  };
  const product: ProductRecord = {
    id: PRODUCT_ID,
    ibuyToken: "TEST-PRODUCT",
    name: `測試 ${displayName} 商品`,
    primaryImageUrl: null,
    imageCachedAt: null,
    isActive: true,
    currentPrice: {
      lastSeenAt: LAST_SUCCESS_AT,
      priceSnapshot: {
        price: 6990,
        currency: "TWD",
        capturedAt: LAST_SUCCESS_AT,
      },
    },
    sourceCategory: {
      id: category.id,
      igrp,
      displayName,
      sourceName: category.sourceName,
    },
  };
  const state = {
    categoryFindFirstCallCount: 0,
    productFindManyCallCount: 0,
    lastCategoryFindFirstArgs: null as CategoryFindFirstArgs | null,
    lastProductFindManyArgs: null as ProductFindManyArgs | null,
  };

  return {
    get categoryFindFirstCallCount() {
      return state.categoryFindFirstCallCount;
    },
    get productFindManyCallCount() {
      return state.productFindManyCallCount;
    },
    get lastCategoryFindFirstArgs() {
      return state.lastCategoryFindFirstArgs;
    },
    get lastProductFindManyArgs() {
      return state.lastProductFindManyArgs;
    },
    sourceCategory: {
      async findFirst(args) {
        state.categoryFindFirstCallCount += 1;
        state.lastCategoryFindFirstArgs = args;

        return category;
      },
    },
    product: {
      async findMany(args) {
        state.productFindManyCallCount += 1;
        state.lastProductFindManyArgs = args;

        return [product];
      },
    },
  } satisfies CategoryLandingReadClient & {
    categoryFindFirstCallCount: number;
    productFindManyCallCount: number;
    lastCategoryFindFirstArgs: CategoryFindFirstArgs | null;
    lastProductFindManyArgs: ProductFindManyArgs | null;
  };
}
