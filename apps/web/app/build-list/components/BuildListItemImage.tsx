"use client";
// apps/web/app/build-list/components/BuildListItemImage.tsx
// 顯示配單品項縮圖，並在圖片缺失或載入失敗時提供可讀的 fallback。

import { useState } from "react";
import type { BuildListItem } from "../model";

// 呈現單一配單品項圖片；圖片失敗後固定改顯示分類 fallback，避免重複觸發錯誤載入。
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
