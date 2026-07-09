// apps/web/app/products/[id]/return-href.ts
// 正規化商品詳細頁 returnTo query，限制返回連結只能指向站內允許頁面。

const INTERNAL_RETURN_URL_ORIGIN = "https://return.partsradar.invalid";
const ALLOWED_RETURN_PATHS = new Set(["/", "/build-list"]);

// 將 query string 中的 returnTo 轉成安全 href，避免外站或不支援路徑被放進返回連結。
export function normalizeReturnHref(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }

  const url = new URL(candidate, INTERNAL_RETURN_URL_ORIGIN);

  if (url.origin !== INTERNAL_RETURN_URL_ORIGIN || !ALLOWED_RETURN_PATHS.has(url.pathname)) {
    return "/";
  }

  return `${url.pathname}${url.search}`;
}
