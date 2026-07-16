// 正規化頁面 returnTo query，限制返回連結只能指向站內允許頁面。

import { getCategoryIgrp } from "../category-slugs";

const INTERNAL_RETURN_URL_ORIGIN = "https://return.partsradar.invalid";
const ALLOWED_RETURN_PATHS = new Set(["/", "/build-list", "/price-report"]);
const BUILD_LIST_RETURN_PATHS = new Set([
  "/",
  "/about",
  "/announcements",
  "/discord",
  "/price-report",
  "/privacy",
  "/terms",
]);
const PRODUCT_DETAIL_PATH_PATTERN = /^\/products\/[^/]+$/;

// 將商品詳細頁的 returnTo 轉成安全 href，避免外站或不支援路徑被放進返回連結。
export function normalizeProductDetailReturnHref(value: string | string[] | undefined) {
  return normalizeInternalReturnHref(value, (url) => ALLOWED_RETURN_PATHS.has(url.pathname));
}

// 正規化配單頁返回來源，允許全站公開頁面與商品詳細頁，但拒絕配單自我返回。
export function normalizeBuildListReturnHref(value: string | string[] | undefined) {
  return normalizeInternalReturnHref(
    value,
    (url) =>
      BUILD_LIST_RETURN_PATHS.has(url.pathname) || PRODUCT_DETAIL_PATH_PATTERN.test(url.pathname),
  );
}

function normalizeInternalReturnHref(
  value: string | string[] | undefined,
  isAllowedPath: (url: URL) => boolean,
) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }

  let url: URL;

  try {
    url = new URL(candidate, INTERNAL_RETURN_URL_ORIGIN);
  } catch {
    return "/";
  }

  if (url.origin !== INTERNAL_RETURN_URL_ORIGIN || !isAllowedPath(url)) {
    return "/";
  }

  if (url.pathname === "/" && !normalizeCategoryQuery(url.searchParams)) {
    return "/";
  }

  return `${url.pathname}${url.search}`;
}

function normalizeCategoryQuery(params: URLSearchParams) {
  const categories = params.getAll("category");

  if (categories.length > 1 || params.has("igrp")) {
    return false;
  }

  const category = categories[0];
  const categoryIgrp = category === undefined ? null : getCategoryIgrp(category);

  if (category !== undefined && categoryIgrp === null) {
    return false;
  }

  return true;
}
