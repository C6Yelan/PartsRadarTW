"use client";
// apps/web/app/build-list/components/BuildListItemRow.tsx
// 呈現 refresh-backed 配單列；missing 或失敗時保留 intent，但不顯示或計入價格。

import Link from "next/link";
import { formatTwdPrice } from "../../_shared/formatting";
import { ExternalLinkIcon } from "../../_shared/icons";
import { ProductImage } from "../../_shared/ProductImage";
import { formatTaipeiDateTime } from "../../_shared/time";
import { BUILD_LIST_MAX_QUANTITY } from "../constants";
import { type BuildListItem, getBuildListLineSubtotal } from "../model";

export default function BuildListItemRow({
  item,
  onQuantityChange,
  onExportSelectionChange,
  onRemove,
}: {
  item: BuildListItem;
  onQuantityChange: (productId: string, quantity: number) => void;
  onExportSelectionChange: (productId: string, includeInExport: boolean) => void;
  onRemove: (item: BuildListItem) => void;
}) {
  const { intent, product } = item;
  const subtotal = getBuildListLineSubtotal(item);
  const displayName = product?.name ?? intent.productId;
  const detailHref = createBuildListProductDetailHref(intent.productId);
  const status = getBuildListItemStatus(item);

  return (
    <article className={`build-list-item${product ? "" : " is-unconfirmed"}`}>
      <div className="build-list-item-media">
        <label className="build-list-export-toggle">
          <input
            aria-label={`將 ${displayName} 加入下載配單`}
            checked={intent.includeInExport}
            type="checkbox"
            onChange={(event) => onExportSelectionChange(intent.productId, event.target.checked)}
          />
        </label>
        <Link
          aria-label={`查看 ${displayName} 商品詳細`}
          className="build-list-item-image-link"
          href={detailHref}
        >
          <ProductImage
            className="build-list-item-image"
            fallbackLabel={product?.category.displayName ?? "商品資料"}
            image={product?.image ?? null}
            key={product?.image?.url ?? product?.id ?? intent.productId}
          />
        </Link>
      </div>
      <div className="build-list-item-main">
        <div className="build-list-item-labels">
          <span className="detail-category-chip">{product?.category.displayName ?? "商品 ID"}</span>
          <span className={`row-state ${status.tone}`}>{status.label}</span>
        </div>
        <h2>
          <Link className="build-list-item-title-link" href={detailHref} title={displayName}>
            {displayName}
          </Link>
        </h2>
        <dl className="build-list-item-facts">
          <div>
            <dt>目前價格</dt>
            <dd>{product?.price ? formatTwdPrice(product.price.amount) : "暫未計價"}</dd>
          </div>
          <div>
            <dt>資料更新</dt>
            <dd>{product ? formatTaipeiDateTime(product.lastSeenAt) : "—"}</dd>
          </div>
          <div>
            <dt>小計</dt>
            <dd>{subtotal === null ? "—" : formatTwdPrice(subtotal)}</dd>
          </div>
        </dl>
        {product ? (
          <div className="build-list-links">
            <a
              aria-label="原價屋查看／購買，開新分頁"
              href={product.source.url}
              rel="noreferrer"
              target="_blank"
            >
              原價屋查看／購買
              <ExternalLinkIcon className="build-list-link-icon" />
            </a>
          </div>
        ) : null}
      </div>

      <div className="build-list-item-controls">
        <fieldset className="quantity-stepper">
          <legend className="sr-only">{displayName} 數量</legend>
          <button
            aria-label="減少數量"
            disabled={intent.quantity <= 1}
            type="button"
            onClick={() => onQuantityChange(intent.productId, intent.quantity - 1)}
          >
            -
          </button>
          <input
            aria-label="數量"
            inputMode="numeric"
            max={BUILD_LIST_MAX_QUANTITY}
            min={1}
            type="number"
            value={intent.quantity}
            onChange={(event) => onQuantityChange(intent.productId, Number(event.target.value))}
          />
          <button
            aria-label="增加數量"
            disabled={intent.quantity >= BUILD_LIST_MAX_QUANTITY}
            type="button"
            onClick={() => onQuantityChange(intent.productId, intent.quantity + 1)}
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

function getBuildListItemStatus(item: BuildListItem): {
  label: string;
  tone: "ok" | "warning";
} {
  if (item.product) {
    if (item.product.status.isExcluded) {
      return { label: "未納入列表", tone: "warning" };
    }

    return item.product.status.isActive
      ? { label: "目前上架", tone: "ok" }
      : { label: "可能已下架", tone: "warning" };
  }

  return item.availability === "loading"
    ? { label: "正在取得最新資料", tone: "warning" }
    : { label: "暫時無法確認", tone: "warning" };
}

function createBuildListProductDetailHref(productId: string) {
  const params = new URLSearchParams({
    returnTo: "/build-list",
  });

  return `/products/${productId}?${params.toString()}`;
}
