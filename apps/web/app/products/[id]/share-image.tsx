// apps/web/app/products/[id]/share-image.tsx
// 使用站內快取圖與公開商品欄位產生品牌化橫式分享卡。

import type { Prisma } from "@partsradar/db";
import { ImageResponse } from "next/og";
import { formatTwdPrice } from "../../_shared/formatting";
import { formatTaipeiDateTime } from "../../_shared/time";
import {
  readCachedProductImage,
  type ProductImageHandlerOptions,
} from "../../api/product-images/handler";
import { normalizeProductId } from "../../api/products/[id]/product-id";
import { PRODUCT_SHARE_IMAGE_SIZE } from "./metadata";

const SHARE_PRODUCT_SELECT = {
  id: true,
  name: true,
  currentPrice: { select: { lastSeenAt: true, priceSnapshot: { select: { price: true } } } },
  sourceCategory: { select: { displayName: true } },
} as const satisfies Prisma.ProductSelect;

type ShareProduct = Prisma.ProductGetPayload<{ select: typeof SHARE_PRODUCT_SELECT }>;

export interface ProductShareImageClient {
  product: {
    findFirst(args: {
      where: { id: string; sourceCategory: { enabled: true }; currentPrice: { isNot: null } };
      select: typeof SHARE_PRODUCT_SELECT;
    }): Promise<ShareProduct | null>;
  };
}

export async function createProductShareImageResponse({
  client,
  productId,
  imageOptions,
}: {
  client: ProductShareImageClient;
  productId: string;
  imageOptions?: ProductImageHandlerOptions;
}): Promise<ImageResponse> {
  const normalizedId = normalizeProductId(productId);
  let product: ShareProduct | null = null;
  let imageBytes: Uint8Array | null = null;

  if (normalizedId) {
    try {
      product = await client.product.findFirst({
        where: {
          id: normalizedId,
          sourceCategory: { enabled: true },
          currentPrice: { isNot: null },
        },
        select: SHARE_PRODUCT_SELECT,
      });
      const cachedWebp = product
        ? await readCachedProductImage(normalizedId, imageOptions)
        : null;
      imageBytes = cachedWebp ? await convertCachedWebpForImageResponse(cachedWebp) : null;
    } catch {
      imageBytes = null;
    }
  }

  const currentPrice = product?.currentPrice;
  const productName = truncateShareText(product?.name ?? "原價屋零件價格查詢", 126);
  const category = product?.sourceCategory.displayName ?? "PartsRadarTW";
  const price = currentPrice
    ? formatTwdPrice(currentPrice.priceSnapshot.price)
    : "查詢電腦零件價格";
  const updatedAt = currentPrice
    ? `更新 ${formatTaipeiDateTime(currentPrice.lastSeenAt)}（台北時間）`
    : "隨時掌握商品價格變動";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 54,
        background: "#07111f",
        color: "#f8fafc",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 30 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: "#60a5fa" }}>PartsRadarTW</span>
            <span style={{ fontSize: 22, color: "#94a3b8" }}>原價屋零件查詢</span>
          </div>
          <span
            style={{
              border: "1px solid #334155",
              borderRadius: 999,
              padding: "9px 18px",
              fontSize: 21,
              color: "#cbd5e1",
            }}
          >
            {category}
          </span>
        </div>
        <div style={{ display: "flex", flex: 1, gap: 46 }}>
          <div
            style={{
              width: 342,
              height: 342,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 28,
              background: "#f8fafc",
              overflow: "hidden",
            }}
          >
            {imageBytes ? (
              // biome-ignore lint/performance/noImgElement: ImageResponse requires an in-memory img source.
              <img
                src={imageBytes as unknown as string}
                alt=""
                width={310}
                height={310}
                style={{ objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  color: "#0f172a",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 54, fontWeight: 900 }}>PR</span>
                <span style={{ fontSize: 20, color: "#475569" }}>商品圖片準備中</span>
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              minWidth: 0,
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "6px 0 4px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div
                style={{
                  fontSize: 36,
                  lineHeight: 1.22,
                  fontWeight: 700,
                  maxHeight: 132,
                  overflow: "hidden",
                }}
              >
                {productName}
              </div>
              <div style={{ fontSize: 58, lineHeight: 1, fontWeight: 900, color: "#fbbf24" }}>
                {price}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 11,
                fontSize: 20,
                color: "#94a3b8",
              }}
            >
              <span>{updatedAt}</span>
              <span>實際價格與供貨以原價屋為準</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    PRODUCT_SHARE_IMAGE_SIZE,
  );
}

function truncateShareText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

// ImageResponse 不直接解碼 WebP；沿用 Next 內建 image optimizer 將站內快取轉成可嵌入的 PNG。
async function convertCachedWebpForImageResponse(bytes: Uint8Array): Promise<Uint8Array> {
  const { optimizeImage } = await import("next/dist/server/image-optimizer");
  return optimizeImage({
    buffer: Buffer.from(bytes),
    contentType: "image/png",
    width: 310,
    height: 310,
    quality: 90,
  });
}
