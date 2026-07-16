// apps/web/app/_shared/product-id.ts
// 提供 web runtime 共用的 product UUID 正規化規則。

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeProductId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();

  return UUID_PATTERN.test(normalizedValue) ? normalizedValue : null;
}
