"use client";
// apps/web/app/products/[id]/detail/ProductDetailMedia.tsx
// 顯示商品詳細頁主圖，並在圖片缺失或載入失敗時提供分類 fallback。

import type { ProductDetailBody } from "./types";

// 呈現商品詳細頁圖片區塊；圖片錯誤後固定顯示 fallback，避免重複觸發載入錯誤。
export default function ProductDetailMedia({
  imageError,
  onImageError,
  product,
}: {
  imageError: boolean;
  onImageError: () => void;
  product: ProductDetailBody;
}) {
  return (
    <div className="detail-media">
      {!product.image || imageError ? (
        <div className="detail-image-fallback" aria-label="圖片暫時無法顯示" role="img">
          <span className="image-fallback-copy">
            <strong>圖片暫時無法顯示</strong>
            <small>{product.category.displayName}</small>
          </span>
        </div>
      ) : (
        // biome-ignore lint/performance/noImgElement: Product images are served by the local API; plain img keeps the fallback path direct.
        <img
          alt={product.image.alt}
          draggable={false}
          referrerPolicy="no-referrer"
          src={product.image.url}
          onContextMenu={(event) => event.preventDefault()}
          onError={onImageError}
        />
      )}
    </div>
  );
}
