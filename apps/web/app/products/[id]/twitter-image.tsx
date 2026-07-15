// apps/web/app/products/[id]/twitter-image.tsx
// 與 Open Graph 共用同一個品牌化商品分享圖 renderer。

import { createProductShareImageResponse } from "./share-image";

export const runtime = "nodejs";
export const alt = "PartsRadarTW 商品價格分享卡";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TwitterImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { prisma } = await import("@partsradar/db");
  return createProductShareImageResponse({ client: prisma, productId: id });
}
