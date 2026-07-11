// apps/web/app/products/[id]/return-href.ts
// 正規化商品詳細頁 returnTo query，限制返回連結只能指向站內允許頁面。

import { getCategoryIgrp, getCategorySlug } from "../../category-slugs";

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

  if (url.pathname === "/" && !normalizeCategoryQuery(url.searchParams)) {
    return "/";
  }

  return `${url.pathname}${url.search}`;
}

function normalizeCategoryQuery(params: URLSearchParams) {
  const categories = params.getAll("category");
  const legacyIgrps = params.getAll("igrp");

  if (categories.length > 1 || legacyIgrps.length > 1) {
    return false;
  }

  const category = categories[0];
  const legacyIgrpValue = legacyIgrps[0];
  const categoryIgrp = category === undefined ? null : getCategoryIgrp(category);
  const legacyIgrp = legacyIgrpValue === undefined ? null : parseLegacyIgrp(legacyIgrpValue);

  if (
    (category !== undefined && categoryIgrp === null) ||
    (legacyIgrpValue !== undefined && legacyIgrp === null) ||
    (categoryIgrp !== null && legacyIgrp !== null && categoryIgrp !== legacyIgrp)
  ) {
    return false;
  }

  if (legacyIgrp !== null) {
    const slug = getCategorySlug(legacyIgrp);

    if (!slug) {
      return false;
    }

    params.delete("igrp");
    params.set("category", slug);
  }

  return true;
}

function parseLegacyIgrp(value: string) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const igrp = Number(value);
  return Number.isSafeInteger(igrp) && getCategorySlug(igrp) ? igrp : null;
}
