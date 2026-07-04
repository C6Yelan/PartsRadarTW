// apps/web/app/build-list/model/validation.ts

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number.NaN;
}

export function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toHttpUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  try {
    const url = new URL(trimmedValue);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function toImageUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.startsWith("/") && !trimmedValue.startsWith("//")) {
    return trimmedValue;
  }

  return toHttpUrl(trimmedValue);
}
