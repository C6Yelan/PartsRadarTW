"use client";
// apps/web/app/products/[id]/detail/ProductDetailMedia.tsx

import type { ProductDetailBody } from "./types";

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
