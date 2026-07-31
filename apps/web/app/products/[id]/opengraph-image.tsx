// apps/web/app/products/[id]/opengraph-image.tsx
// 提供商品連結的 1200×630 Open Graph PNG，只讀取站內資料與快取圖。

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

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, requestHeaders] = await Promise.all([params, headers()]);

  return handleProductShareImage({
    headers: requestHeaders,
    productId: id,
  });
}
