// packages/shared/src/product-image-url.ts
// 定義商品圖片 public API path，保持 host-relative 以支援 localhost、私有驗證與 Cloudflare Tunnel。

// 建立站內商品圖片路徑，並將 product id 正規化為小寫檔名。
export function createPublicProductImagePath(productId: string): string {
  return `/api/product-images/${encodeURIComponent(productId.toLowerCase())}.webp`;
}
