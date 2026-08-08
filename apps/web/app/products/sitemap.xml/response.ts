// apps/web/app/products/sitemap.xml/response.ts
// 將公開商品 UUID 轉成 deterministic XML，並安全處理讀取失敗。

import { resolvePublicSiteUrl } from "../../_shared/public-site";

export const PRODUCT_SITEMAP_REVALIDATE_SECONDS = 21_600;

type LoadPublicProductIds = () => Promise<string[]>;

export async function createProductSitemapResponse(
  loadPublicProductIds: LoadPublicProductIds,
): Promise<Response> {
  try {
    const productIds = await loadPublicProductIds();

    return new Response(createProductSitemapXml(productIds), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    });
  } catch {
    return new Response("Service Unavailable", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}

export function createProductSitemapXml(productIds: readonly string[]): string {
  const publicSiteUrl = resolvePublicSiteUrl();
  const uniqueProductIds = [...new Set(productIds)].sort((left, right) =>
    left.localeCompare(right),
  );
  const entries = uniqueProductIds.map((productId) => {
    const productUrl = new URL(
      `/products/${encodeURIComponent(productId)}`,
      `${publicSiteUrl}/`,
    ).toString();

    return `  <url><loc>${escapeXml(productUrl)}</loc></url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
