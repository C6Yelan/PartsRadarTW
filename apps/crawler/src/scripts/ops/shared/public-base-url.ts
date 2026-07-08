// apps/crawler/src/scripts/ops/shared/public-base-url.ts
// 正規化 ops 腳本使用的 PartsRadarTW 公開網址，供 Discord 連結與訊息內容共用。

// 只接受 HTTP(S) base URL，並移除 query、hash 與尾端斜線，避免組連結時產生不穩定網址。
export function normalizePublicBaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("PARTSRADAR_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PARTSRADAR_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }

  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";

  return url.toString();
}
