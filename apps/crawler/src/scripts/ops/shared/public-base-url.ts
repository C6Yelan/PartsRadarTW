// apps/crawler/src/scripts/ops/shared/public-base-url.ts

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
