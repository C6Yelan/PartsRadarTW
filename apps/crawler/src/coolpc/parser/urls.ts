import {
  COOLPC_OFFICIAL_BASE_URL,
  COOLPC_OFFICIAL_HOSTNAME,
  COOLPC_SOURCE_NAME,
  createCoolpcCategoryUrl as createSharedCoolpcCategoryUrl,
} from "@partsradar/shared";

export function createCoolpcCategoryUrl(
  igrp: number,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): string {
  return createSharedCoolpcCategoryUrl(igrp, baseUrl);
}

export function createSourceItemKey(igrp: number, ibuyToken: string): string {
  return `${COOLPC_SOURCE_NAME}:igrp:${igrp}:ibuy:${ibuyToken}`;
}

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

export function normalizeCoolpcIntroductionUrl(
  rawIntroductionUrl: string,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): string | null {
  const trimmedUrl = rawIntroductionUrl.trim();

  if (trimmedUrl.length === 0) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmedUrl, baseUrl);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  return url.toString();
}

export function sanitizeCoolpcSourceUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  // Session IDs are request state, not a stable product or category source URL.
  url.searchParams.delete("PHPSESSID");
  return url.toString();
}
