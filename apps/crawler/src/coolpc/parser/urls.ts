// apps/crawler/src/coolpc/parser/urls.ts
// 管理 CoolPC 解析流程中的來源身分 key、商品圖片位址正規化與來源 URL 清理。

import {
  COOLPC_OFFICIAL_BASE_URL,
  COOLPC_OFFICIAL_HOSTNAME,
  COOLPC_SOURCE_NAME,
} from "@partsradar/shared";

// 組合 parser 的 source product key，維持來自 CoolPC 的來源唯一識別方式。
export function createCoolpcSourceProductKey(igrp: number, ibuyToken: string): string {
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

// 只有看起來確實是圖片的 URL 才值得記錄異常；來源缺圖 placeholder 與功能連結直接略過。
export function shouldReportInvalidCoolpcProductImageUrl(
  rawImageUrl: string,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): boolean {
  const trimmedImageUrl = rawImageUrl.trim();
  if (trimmedImageUrl.length === 0) {
    return false;
  }

  try {
    const url = new URL(trimmedImageUrl, baseUrl);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      /\.(?:jpg|jpeg|png|gif|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

// 移除來源分類 URL 中的 session 參數，保留可追蹤但不帶 request state 的穩定網址。
export function sanitizeCoolpcSourceCategoryUrl(sourceCategoryUrl: string): string {
  const url = new URL(sourceCategoryUrl);
  // Session ID 屬於請求狀態，不是可持久比對的來源 URL。
  url.searchParams.delete("PHPSESSID");
  return url.toString();
}
