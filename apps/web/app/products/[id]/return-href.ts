// apps/web/app/products/[id]/return-href.ts
const INTERNAL_RETURN_URL_ORIGIN = "https://return.partsradar.invalid";
const ALLOWED_RETURN_PATHS = new Set(["/", "/build-list"]);

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
