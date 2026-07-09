"use client";
// apps/web/app/build-list/components/BuildListItemRow.tsx
// 呈現配單單一品項列，串接商品詳細連結、來源連結、數量控制與移除操作。

import Link from "next/link";
import { formatBuildListDateTime, formatBuildListPrice } from "../formatting";
import { BUILD_LIST_MAX_QUANTITY, getBuildListLineSubtotal, type BuildListItem } from "../model";
import BuildListItemImage from "./BuildListItemImage";

// 組裝配單品項列，將互動事件交回頁面層維護配單狀態。
export default function BuildListItemRow({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: BuildListItem;
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (item: BuildListItem) => void;
}) {
  const subtotal = getBuildListLineSubtotal(item);
  const detailHref = createBuildListProductDetailHref(item.id);

  return (
    <article className="build-list-item">
      <Link
        aria-label={`查看 ${item.name} 商品詳細`}
        className="build-list-item-image-link"
        href={detailHref}
      >
        <BuildListItemImage item={item} />
      </Link>
      <div className="build-list-item-main">
        <span className="detail-category-chip">{item.category.displayName}</span>
        <h2>
          <Link className="build-list-item-title-link" href={detailHref} title={item.name}>
            {item.name}
          </Link>
        </h2>
        <dl className="build-list-item-facts">
          <div>
            <dt>目前價格</dt>
            <dd>{formatBuildListPrice(item.price.amount)}</dd>
          </div>
          <div>
            <dt>價格更新</dt>
            <dd>{formatBuildListDateTime(item.price.lastSeenAt)}</dd>
          </div>
          <div>
            <dt>小計</dt>
            <dd>{formatBuildListPrice(subtotal)}</dd>
          </div>
        </dl>
        <div className="build-list-links">
          <a href={item.source.url} rel="noreferrer" target="_blank">
            原價屋查看／購買
            <span className="build-list-link-icon" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
      </div>

      <div className="build-list-item-controls">
        <fieldset className="quantity-stepper">
          <legend className="sr-only">{item.name} 數量</legend>
          <button
            aria-label="減少數量"
            disabled={item.quantity <= 1}
            type="button"
            onClick={() => onQuantityChange(item.id, item.quantity - 1)}
          >
            -
          </button>
          <input
            aria-label="數量"
            inputMode="numeric"
            max={BUILD_LIST_MAX_QUANTITY}
            min={1}
            type="number"
            value={item.quantity}
            onChange={(event) => onQuantityChange(item.id, Number(event.target.value))}
          />
          <button
            aria-label="增加數量"
            disabled={item.quantity >= BUILD_LIST_MAX_QUANTITY}
            type="button"
            onClick={() => onQuantityChange(item.id, item.quantity + 1)}
          >
            +
          </button>
        </fieldset>
        <button className="build-list-remove-button" type="button" onClick={() => onRemove(item)}>
          移除
        </button>
      </div>
    </article>
  );
}

// 建立從配單進入商品詳細頁的連結，讓詳細頁返回時能回到配單。
function createBuildListProductDetailHref(productId: string) {
  const params = new URLSearchParams({
    returnTo: "/build-list",
  });

  return `/products/${productId}?${params.toString()}`;
}
