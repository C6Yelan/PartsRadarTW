"use client";
// apps/web/app/build-list/components/BuildListItemImage.tsx
// 顯示當次 refresh 商品縮圖，未知或載入失敗時使用不含舊 snapshot 的 fallback。

import { useState } from "react";
import type { BuildListProductSnapshot } from "../model";

export default function BuildListItemImage({
  product,
}: {
  product: BuildListProductSnapshot | null;
}) {
  const [hasError, setHasError] = useState(false);

  if (!product?.image || hasError) {
    const fallbackLabel = product?.category.displayName ?? "商品資料";

    return (
      <div
        className="build-list-item-image fallback"
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
      alt={product.image.alt}
      className="build-list-item-image"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={product.image.url}
      onContextMenu={(event) => event.preventDefault()}
      onError={() => setHasError(true)}
    />
  );
}
