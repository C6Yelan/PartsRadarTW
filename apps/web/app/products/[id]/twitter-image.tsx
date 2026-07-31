// apps/web/app/products/[id]/twitter-image.tsx
// 與 Open Graph 共用同一個品牌化商品分享圖 renderer。

import { headers } from "next/headers";
import { createProductShareImageHandler } from "./share-image-handler";

export const runtime = "nodejs";
export const alt = "PartsRadarTW 商品價格分享卡";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const handleProductShareImage = createProductShareImageHandler({
  loadClient: async () => {
    const { prisma } = await import("@partsradar/db");

    return prisma;
  },
});

export default async function TwitterImage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, requestHeaders] = await Promise.all([params, headers()]);

  return handleProductShareImage({
    headers: requestHeaders,
    productId: id,
  });
}
