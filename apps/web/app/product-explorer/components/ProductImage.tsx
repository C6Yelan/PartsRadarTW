// apps/web/app/product-explorer/components/ProductImage.tsx
import { useState } from "react";

interface ProductImageProps {
  fallbackLabel: string;
  image: {
    url: string;
    alt: string;
  } | null;
}

export function ProductImage({ fallbackLabel, image }: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  if (!image || hasError) {
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
      alt={image.alt}
      className="product-image"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={image.url}
      onContextMenu={(event) => event.preventDefault()}
      onError={() => setHasError(true)}
    />
  );
}
