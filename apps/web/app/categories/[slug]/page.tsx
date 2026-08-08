// 將合法 category pathname 薄接到既有 ProductExplorer，並提供 route metadata。

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CATEGORY_MAPPINGS, getCategoryMapping, getCategoryPath } from "../../category-slugs";
import ProductExplorer from "../../product-explorer/ProductExplorer";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return CATEGORY_MAPPINGS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const category = resolveCategory(await params);
  const canonical = getCategoryPath(category.slug);

  return {
    title: `${category.displayName} 價格查詢 | PartsRadarTW`,
    description: `查詢原價屋 ${category.displayName} 商品價格，並依廠商、規格、價格與上架狀態篩選。`,
    alternates: {
      canonical,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const category = resolveCategory(await params);

  return (
    <Suspense fallback={<div className="page-loading">載入查詢工具</div>}>
      <ProductExplorer routeState={{ category: category.slug }} />
    </Suspense>
  );
}

function resolveCategory({ slug }: { slug: string }) {
  const category = getCategoryMapping(slug);

  if (!category) {
    notFound();
  }

  return category;
}
