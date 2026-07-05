// apps/crawler/src/coolpc/parser/urls.ts
// 管理 CoolPC 解析流程中的 URL 相關邏輯：分類頁組合、來源身分 key、商品圖片位址正規化與來源 URL 清理。

import {
  COOLPC_OFFICIAL_BASE_URL,
  COOLPC_OFFICIAL_HOSTNAME,
  COOLPC_SOURCE_NAME,
  createCoolpcCategoryUrl as createSharedCoolpcCategoryUrl,
} from "@partsradar/shared";

// 建立 CoolPC 分類頁 URL，預設使用官方 base URL，並保留 baseUrl 可覆寫（測試/環境覆寫用）。
export function createCoolpcCategoryUrl(
  igrp: number,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): string {
  return createSharedCoolpcCategoryUrl(igrp, baseUrl);
}

// 組合 parser 的 source item key，維持來自 CoolPC 的來源唯一識別方式。
export function createSourceItemKey(igrp: number, ibuyToken: string): string {
  return `${COOLPC_SOURCE_NAME}:igrp:${igrp}:ibuy:${ibuyToken}`;
}

// 驗證並清理商品圖片 URL：只保留合法 CoolPC 圖片位址（指定 IGrp 與副檔名），否則回傳 null。
export function normalizeCoolpcProductImageUrl(
  rawImageUrl: string,
  igrp: number,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): string | null {
  if (!Number.isInteger(igrp) || igrp <= 0) {
    return null;
  }

  const trimmedImageUrl = rawImageUrl.trim();

  if (trimmedImageUrl.length === 0) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmedImageUrl, baseUrl);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  if (url.hostname !== COOLPC_OFFICIAL_HOSTNAME) {
    return null;
  }

  const expectedPathPattern = new RegExp(
    `^/eval/${igrp}/[^/?#]+\\.(?:jpg|jpeg|png|gif|webp)$`,
    "i",
  );

  if (!expectedPathPattern.test(url.pathname)) {
    return null;
  }

  return `${COOLPC_OFFICIAL_BASE_URL}${url.pathname}`;
}

// 移除來源 URL 中的 session 參數，保留可追蹤但不帶 request state 的穩定網址。
export function sanitizeCoolpcSourceUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  // Session ID 屬於請求狀態，不是可持久比對的來源 URL。
  url.searchParams.delete("PHPSESSID");
  return url.toString();
}
