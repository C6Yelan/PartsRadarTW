// apps/web/app/_shared/public-site.ts
// 集中解析 metadata、robots 與 sitemap 使用的可信公開站台 origin。

export const DEFAULT_PUBLIC_SITE_URL = "https://partsradar.net";

export function resolvePublicSiteUrl(publicSiteUrl?: string | null): string {
  const candidate =
    publicSiteUrl?.trim() ||
    process.env.PARTSRADAR_PUBLIC_BASE_URL?.trim() ||
    DEFAULT_PUBLIC_SITE_URL;

  try {
    const url = new URL(candidate);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_PUBLIC_SITE_URL;
    }

    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}
