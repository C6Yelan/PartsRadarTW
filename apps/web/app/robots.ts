// apps/web/app/robots.ts
// 發布搜尋引擎可讀的公開索引規則與 sitemap 位置。

import type { MetadataRoute } from "next";
import { resolvePublicSiteUrl } from "./_shared/public-site";

export default function robots(): MetadataRoute.Robots {
  const publicSiteUrl = resolvePublicSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: [
      new URL("/sitemap.xml", `${publicSiteUrl}/`).toString(),
      new URL("/products/sitemap.xml", `${publicSiteUrl}/`).toString(),
    ],
  };
}
