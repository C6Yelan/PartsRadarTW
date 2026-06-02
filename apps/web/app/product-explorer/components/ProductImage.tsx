// apps/web/app/product-explorer/components/ProductImage.tsx
import { useState } from "react";

interface ProductImageProps {
  alt: string;
  fallbackLabel: string;
  src: string;
}

export function ProductImage({ alt, fallbackLabel, src }: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className="product-image fallback"
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
      alt={alt}
      className="product-image"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={src}
      onContextMenu={(event) => event.preventDefault()}
      onError={() => setHasError(true)}
    />
  );
}
