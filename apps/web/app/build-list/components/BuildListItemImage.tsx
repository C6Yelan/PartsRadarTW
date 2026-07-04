"use client";
// apps/web/app/build-list/components/BuildListItemImage.tsx

import { useState } from "react";
import type { BuildListItem } from "../model";

export default function BuildListItemImage({ item }: { item: BuildListItem }) {
  const [hasError, setHasError] = useState(false);

  if (!item.image || hasError) {
    return (
      <div
        className="build-list-item-image fallback"
        aria-label={`${item.category.displayName}圖片暫時無法顯示`}
        role="img"
      >
        <span className="image-fallback-copy">
          <strong>無圖</strong>
          <small>{item.category.displayName}</small>
        </span>
      </div>
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: Product images are served by the local API; plain img keeps the fallback path direct.
    <img
      alt={item.image.alt}
      className="build-list-item-image"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={item.image.url}
      onContextMenu={(event) => event.preventDefault()}
      onError={() => setHasError(true)}
    />
  );
}
