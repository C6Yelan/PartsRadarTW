// apps/web/app/api/product-images/handler.ts
// 將商品圖片 route name 轉成受信任 UUID，並映射快取讀取結果為安全 HTTP 回應。

import { normalizeProductId } from "../../_shared/product-id";
import {
  type ProductImageStorageOptions,
  readCachedProductImage,
} from "../../_shared/product-image-storage";
import { internalErrorResponse, notFoundResponse } from "../_shared/responses";

const PRODUCT_IMAGE_CONTENT_TYPE = "image/webp";
const PRODUCT_IMAGE_CACHE_CONTROL = "public, max-age=3600";

// 建立商品縮圖 API handler；只讀本機快取，不在訪客請求期間抓取來源站圖片。
export function createGetProductImageHandler(
  options: ProductImageStorageOptions = {},
): (imageId: unknown) => Promise<Response> {
  return async (imageId) => {
    try {
      const normalizedProductId = normalizeProductImageRouteName(imageId);

      if (!normalizedProductId) {
        return notFoundResponse();
      }

      const bytes = await readCachedProductImage(normalizedProductId, options);

      if (!bytes) {
        return notFoundResponse();
      }

      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          "Cache-Control": PRODUCT_IMAGE_CACHE_CONTROL,
          "Content-Length": String(bytes.byteLength),
          "Content-Type": PRODUCT_IMAGE_CONTENT_TYPE,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return internalErrorResponse();
    }
  };
}

// 圖片 route 可使用裸 UUID 或單一 `.webp` 副檔名；UUID 格式由共用 policy 決定。
function normalizeProductImageRouteName(imageId: unknown): string | null {
  if (typeof imageId !== "string") {
    return null;
  }

  const value = imageId.trim();
  const hasWebpSuffix = value.toLowerCase().endsWith(".webp");
  const productId = hasWebpSuffix ? value.slice(0, -".webp".length) : value;

  if (hasWebpSuffix && productId !== productId.trim()) {
    return null;
  }

  return normalizeProductId(productId);
}
