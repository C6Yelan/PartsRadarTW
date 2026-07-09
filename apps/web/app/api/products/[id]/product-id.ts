// apps/web/app/api/products/[id]/product-id.ts
// 提供商品 detail、price-history 與 metadata 共用的 public product id 正規化規則。

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 將 route 取得的 product id 正規化為小寫 UUID；格式不合法時回傳 null 讓上層回 404。
export function normalizeProductId(productId: string): string | null {
  const value = productId.trim().toLowerCase();

  return UUID_PATTERN.test(value) ? value : null;
}
