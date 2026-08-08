// apps/web/app/sitemap.ts
// 列出不含使用者狀態或查詢參數的穩定公開頁面。

import type { MetadataRoute } from "next";
import { resolvePublicSiteUrl } from "./_shared/public-site";
import { CATEGORY_MAPPINGS, getCategoryPath } from "./category-slugs";

const PUBLIC_SITEMAP_PATHS = [
  "/",
  ...CATEGORY_MAPPINGS.map(({ slug }) => getCategoryPath(slug)),
  "/price-report",
  "/discord",
  "/about",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const publicSiteUrl = resolvePublicSiteUrl();

  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: new URL(path, `${publicSiteUrl}/`).toString(),
  }));
}
