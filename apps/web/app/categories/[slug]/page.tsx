// apps/web/app/categories/[slug]/page.tsx
// 提供正式 category slug 的 canonical server-rendered landing page。

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryLanding from "./category-landing";
import { getCategoryLanding } from "./data";
import { buildCategoryMetadata, buildMissingCategoryMetadata } from "./metadata";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCategoryLanding(slug);

  return data ? buildCategoryMetadata(data) : buildMissingCategoryMetadata();
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const data = await getCategoryLanding(slug);

  if (!data) {
    notFound();
  }

  return <CategoryLanding data={data} />;
}
