// apps/web/app/products/[id]/share-image.tsx
// 使用站內快取圖與公開商品欄位產生品牌化橫式分享卡。

import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatTwdPrice } from "../../_shared/formatting";
import { formatTaipeiDateTime } from "../../_shared/time";
import { PRODUCT_SHARE_IMAGE_SIZE } from "./metadata";

const EMBEDDED_IMAGE_MAX_DIMENSION = 310;
const EMBEDDED_IMAGE_MAX_PIXELS = 512 * 512;

export interface ProductShareImageData {
  id: string;
  name: string;
  currentPrice: {
    lastSeenAt: Date;
    priceSnapshot: {
      price: number;
    };
  };
  sourceCategory: {
    displayName: string;
  };
}

export async function renderProductShareImageResponse({
  product,
  imageBytes,
}: {
  product: ProductShareImageData;
  imageBytes: Uint8Array | null;
}): Promise<ImageResponse> {
  const embeddedImageBytes = imageBytes
    ? await convertCachedWebpForImageResponse(imageBytes).catch(() => null)
    : null;
  const productName = truncateShareText(product.name, 126);
  const category = truncateShareText(product.sourceCategory.displayName, 36);
  const price = formatTwdPrice(product.currentPrice.priceSnapshot.price);
  const updatedAt = `更新 ${formatTaipeiDateTime(product.currentPrice.lastSeenAt)}（台北時間）`;

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
            {embeddedImageBytes ? (
              // biome-ignore lint/performance/noImgElement: ImageResponse requires an in-memory img source.
              <img
                src={embeddedImageBytes as unknown as string}
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

// ImageResponse 不直接解碼 WebP；使用公開 sharp API 轉為受尺寸限制的 PNG。
async function convertCachedWebpForImageResponse(bytes: Uint8Array): Promise<Uint8Array> {
  return sharp(bytes, {
    failOn: "error",
    limitInputPixels: EMBEDDED_IMAGE_MAX_PIXELS,
  })
    .resize({
      width: EMBEDDED_IMAGE_MAX_DIMENSION,
      height: EMBEDDED_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}
