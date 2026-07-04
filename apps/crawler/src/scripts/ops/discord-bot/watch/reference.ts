// apps/crawler/src/scripts/ops/discord-bot/watch/reference.ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const WATCH_SELECT_VALUE_PREFIX = "watch:";

export function normalizeWatchProductReference(value: string): string | null {
  const input = value.trim();
  const normalizedDirectId = normalizeProductId(input);

  if (normalizedDirectId) {
    return normalizedDirectId;
  }

  const pathProductId = extractProductIdFromPath(input);

  if (pathProductId) {
    return pathProductId;
  }

  try {
    return extractProductIdFromPath(new URL(input).pathname);
  } catch {
    return null;
  }
}

export function normalizeWatchId(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  const unprefixed = normalized.startsWith(WATCH_SELECT_VALUE_PREFIX)
    ? normalized.slice(WATCH_SELECT_VALUE_PREFIX.length)
    : normalized;

  return UUID_PATTERN.test(unprefixed) ? unprefixed : null;
}

function extractProductIdFromPath(value: string): string | null {
  const match = value.match(/(?:^|\/)products\/([^/?#]+)/i);

  if (!match?.[1]) {
    return null;
  }

  let candidate: string;

  try {
    candidate = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  return normalizeProductId(candidate);
}

function normalizeProductId(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  return UUID_PATTERN.test(normalized) ? normalized : null;
}
