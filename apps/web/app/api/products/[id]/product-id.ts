// apps/web/app/api/products/[id]/product-id.ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeProductId(productId: string): string | null {
  const value = productId.trim().toLowerCase();

  return UUID_PATTERN.test(value) ? value : null;
}
