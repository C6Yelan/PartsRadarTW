// apps/web/app/build-list/product-id.ts
// 提供配單 intent 與 refresh API 共用的 product UUID 正規化規則。

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeBuildListProductId(productId: unknown): string | null {
  if (typeof productId !== "string") {
    return null;
  }

  const normalizedProductId = productId.trim().toLowerCase();

  return UUID_PATTERN.test(normalizedProductId) ? normalizedProductId : null;
}
