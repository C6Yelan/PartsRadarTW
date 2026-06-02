// packages/shared/src/product-image-url.ts
// Product image routes are host-relative so API responses and crawler smoke
// output stay portable across localhost, private validation, and Cloudflare Tunnel.
export function createPublicProductImagePath(productId: string): string {
  return `/api/product-images/${encodeURIComponent(productId.toLowerCase())}.webp`;
}
