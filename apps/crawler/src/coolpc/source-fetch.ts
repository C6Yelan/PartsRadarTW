// CoolPC 專用逐跳 transport policy；HTML 與商品圖片各自維持固定 origin/path 邊界。

import { COOLPC_OFFICIAL_HOSTNAME } from "@partsradar/shared";

export const MAX_COOLPC_REDIRECTS = 3;

export type CoolpcSourceKind = "category-html" | "filter-html" | "product-image";

export class CoolpcSourceFetchError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "policy" | "redirect",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CoolpcSourceFetchError";
  }
}

export async function fetchCoolpcSource(
  url: string,
  {
    kind,
    fetchImpl = fetch,
    requestInit = {},
    maxRedirects = MAX_COOLPC_REDIRECTS,
  }: {
    kind: CoolpcSourceKind;
    fetchImpl?: typeof fetch;
    requestInit?: RequestInit;
    maxRedirects?: number;
  },
): Promise<Response> {
  let currentUrl = parseAndValidateCoolpcSourceUrl(url, kind);
  const visitedUrls = new Set<string>();

  for (let redirectCount = 0; ; redirectCount += 1) {
    if (visitedUrls.has(currentUrl.href)) {
      throw new CoolpcSourceFetchError("CoolPC source redirect loop rejected.", "redirect");
    }
    visitedUrls.add(currentUrl.href);

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        ...requestInit,
        redirect: "manual",
      });
    } catch (error) {
      throw new CoolpcSourceFetchError("CoolPC source request failed.", "network", {
        cause: error,
      });
    }

    if (!isRedirectStatus(response.status)) {
      return response;
    }
    if (redirectCount >= maxRedirects) {
      throw new CoolpcSourceFetchError("CoolPC source redirect limit exceeded.", "redirect");
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new CoolpcSourceFetchError("CoolPC source redirect is missing Location.", "redirect");
    }

    let redirectedUrl: URL;
    try {
      redirectedUrl = new URL(location, currentUrl);
    } catch {
      throw new CoolpcSourceFetchError("CoolPC source redirect Location is invalid.", "redirect");
    }
    currentUrl = validateCoolpcSourceUrl(redirectedUrl, kind);
  }
}

export function assertCoolpcHtmlContentType(response: Response): void {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.startsWith("text/html") && !contentType.startsWith("application/xhtml+xml")) {
    throw new CoolpcSourceFetchError("CoolPC HTML response Content-Type is invalid.", "policy");
  }
}

function parseAndValidateCoolpcSourceUrl(url: string, kind: CoolpcSourceKind): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new CoolpcSourceFetchError("CoolPC source URL is invalid.", "policy");
  }

  return validateCoolpcSourceUrl(parsedUrl, kind);
}

function validateCoolpcSourceUrl(url: URL, kind: CoolpcSourceKind): URL {
  if (
    url.protocol !== "https:" ||
    url.hostname !== COOLPC_OFFICIAL_HOSTNAME ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new CoolpcSourceFetchError("CoolPC source origin rejected.", "policy");
  }

  const validPath =
    kind === "category-html"
      ? url.pathname === "/eachview.php"
      : kind === "filter-html"
        ? url.pathname === "/evaluate.php"
        : /^\/eval\/[1-9]\d*\/[^/?#]+\.(?:jpe?g|png|gif|webp)$/i.test(url.pathname);

  if (!validPath) {
    throw new CoolpcSourceFetchError("CoolPC source path rejected.", "policy");
  }

  return url;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
