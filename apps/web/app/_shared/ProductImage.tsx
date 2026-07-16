// apps/web/app/_shared/ProductImage.tsx
// 呈現商品圖片，並在缺圖或載入失敗時顯示分類 fallback。

import { useState } from "react";

interface ProductImageProps {
  className?: string;
  fallbackLabel: string;
  image: {
    url: string;
    alt: string;
  } | null;
}

// 顯示單一商品縮圖，圖片失敗時切換為無圖狀態以避免破圖留在列表中。
export function ProductImage({
  className = "product-image",
  fallbackLabel,
  image,
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  if (!image || hasError) {
    return (
      <div
        className={`${className} fallback`}
        aria-label={`${fallbackLabel}圖片暫時無法顯示`}
        role="img"
      >
        <span className="image-fallback-copy">
          <strong>無圖</strong>
          <small>{fallbackLabel}</small>
        </span>
      </div>
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: Product images are served by the local API; plain img keeps the fallback path direct.
    <img
      alt={image.alt}
      className={className}
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={image.url}
      onContextMenu={(event) => event.preventDefault()}
      onError={() => setHasError(true)}
    />
  );
}
