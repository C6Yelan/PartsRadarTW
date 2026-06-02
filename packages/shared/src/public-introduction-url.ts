// Introduction links are display-only references, so low-quality marketplace/download
// targets are filtered before a stored URL reaches public API responses or link checks.
const BLOCKED_INTRODUCTION_HOST_SUFFIXES = [".shopee.tw"];
const BLOCKED_INTRODUCTION_HOSTS = new Set(["shopee.tw"]);
const BLOCKED_INTRODUCTION_PATH_KEYWORDS = [
  "driver",
  "drivers",
  "download",
  "downloads",
  "previous-drivers",
];
const INTRODUCTION_QUERY_PARAMS_TO_STRIP = new Set([
  "access_token",
  "auth",
  "authorization",
  "fbclid",
  "gclid",
  "msclkid",
  "phpsessid",
  "session",
  "session_id",
  "sessionid",
  "sid",
  "token",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

export function toPublicIntroductionUrl(introductionUrl: string | null): string | null {
  if (!introductionUrl) {
    return null;
  }

  try {
    const url = new URL(introductionUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    if (!isPublicIntroductionUrl(url)) {
      return null;
    }

    return stripPrivateIntroductionUrlParts(url).toString();
  } catch {
    return null;
  }
}

function isPublicIntroductionUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = url.pathname.toLowerCase();

  if (
    BLOCKED_INTRODUCTION_HOSTS.has(hostname) ||
    BLOCKED_INTRODUCTION_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return false;
  }

  if (pathname.endsWith(".pdf")) {
    return false;
  }

  return !BLOCKED_INTRODUCTION_PATH_KEYWORDS.some((keyword) => pathname.includes(keyword));
}

function stripPrivateIntroductionUrlParts(url: URL): URL {
  const sanitizedUrl = new URL(url);
  // Fragments and common campaign/session params are not needed for attribution and may leak state.
  sanitizedUrl.hash = "";

  for (const key of Array.from(sanitizedUrl.searchParams.keys())) {
    if (INTRODUCTION_QUERY_PARAMS_TO_STRIP.has(key.toLowerCase())) {
      sanitizedUrl.searchParams.delete(key);
    }
  }

  return sanitizedUrl;
}
