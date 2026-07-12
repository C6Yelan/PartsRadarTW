// apps/web/app/sitemap.ts
// 列出不含使用者狀態或查詢參數的穩定公開頁面。

import type { MetadataRoute } from "next";
import { resolvePublicSiteUrl } from "./_shared/public-site";

const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/price-report",
  "/status",
  "/discord",
  "/about",
  "/announcements",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const publicSiteUrl = resolvePublicSiteUrl();

  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: new URL(path, `${publicSiteUrl}/`).toString(),
  }));
}
