// apps/web/app/categories/[slug]/metadata.ts
// 建立 category-specific title、description 與 canonical metadata。

import type { Metadata } from "next";
import type { CategoryLandingData } from "./data";

const SITE_NAME = "PartsRadarTW";

export function buildCategoryMetadata(data: CategoryLandingData): Metadata {
  const title = `${data.category.displayName} 電腦零件價格 | ${SITE_NAME}`;
  const description = `查看 ${data.category.displayName} 目前上架商品與價格更新資訊。資料整理自原價屋公開頁面，實際價格與供貨以來源頁為準。`;

  return {
    title,
    description,
    alternates: {
      canonical: `/categories/${data.category.slug}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: SITE_NAME,
      locale: "zh_TW",
      url: `/categories/${data.category.slug}`,
    },
  };
}

export function buildMissingCategoryMetadata(): Metadata {
  return {
    title: `找不到分類 | ${SITE_NAME}`,
    robots: {
      index: false,
      follow: false,
    },
  };
}
