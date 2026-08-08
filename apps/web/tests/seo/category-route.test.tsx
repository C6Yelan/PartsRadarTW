// 驗證 category route validation、metadata 與共用 ProductExplorer integration。

import { Children, isValidElement } from "react";
import { describe, expect, it } from "vitest";
import CategoryPage, {
  generateMetadata,
  generateStaticParams,
} from "../../app/categories/[slug]/page";
import { CATEGORY_MAPPINGS } from "../../app/category-slugs";
import HomePage from "../../app/page";
import ProductExplorer from "../../app/product-explorer/ProductExplorer";

const EXPECTED_CATEGORY_SLUGS = [
  "cpu",
  "motherboard",
  "memory",
  "storage",
  "hard-drive",
  "external-storage",
  "cooler",
  "liquid-cooling",
  "gpu",
  "case",
  "power-supply",
  "fan-accessory",
] as const;

describe("category route", () => {
  it("prepares exactly the 12 frozen category routes", () => {
    expect(generateStaticParams()).toEqual(EXPECTED_CATEGORY_SLUGS.map((slug) => ({ slug })));
  });

  it.each(EXPECTED_CATEGORY_SLUGS)("uses category-specific metadata for %s", async (slug) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
    const category = CATEGORY_MAPPINGS.find((mapping) => mapping.slug === slug);

    expect(category).toBeDefined();
    expect(metadata).toEqual({
      title: `${category?.displayName} 價格查詢 | PartsRadarTW`,
      description: `查詢原價屋 ${category?.displayName} 商品價格，並依廠商、規格、價格與上架狀態篩選。`,
      alternates: {
        canonical: `/categories/${slug}`,
      },
    });
  });

  it("returns the real Next.js not-found signal for an invalid slug", async () => {
    await expect(
      CategoryPage({ params: Promise.resolve({ slug: "not-a-category" }) }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("renders the same ProductExplorer component on home and category routes", async () => {
    const homeExplorer = getSuspenseChild(HomePage());
    const categoryExplorer = getSuspenseChild(
      await CategoryPage({ params: Promise.resolve({ slug: "gpu" }) }),
    );

    expect(homeExplorer.type).toBe(ProductExplorer);
    expect(homeExplorer.props.routeState).toEqual({ category: null });
    expect(categoryExplorer.type).toBe(ProductExplorer);
    expect(categoryExplorer.props).toEqual({ routeState: { category: "gpu" } });
  });
});

function getSuspenseChild(element: ReturnType<typeof HomePage>) {
  const child = Children.only(element.props.children);

  if (!isValidElement<{ routeState: { category: string | null } }>(child)) {
    throw new Error("Expected a ProductExplorer element inside Suspense.");
  }

  return child;
}
