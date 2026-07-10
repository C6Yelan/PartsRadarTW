// apps/web/app/product-explorer/components/ProductRow.tsx
// 呈現商品探索列表中的單筆商品列，包含圖片、價格、價格變動、上架狀態與配單控制。

import Link from "next/link";
import { formatSignedTwdPrice, formatTwdPrice } from "../../_shared/formatting";
import { BUILD_LIST_MAX_QUANTITY, MAX_BUILD_LIST_PRODUCTS } from "../../build-list/model";
import type { ProductListItem } from "../types";
import { ProductImage } from "./ProductImage";

interface ProductRowProps {
  buildListQuantity: number;
  detailHref: string;
  isProductLimitReached: boolean;
  product: ProductListItem;
  onAddToBuildList(product: ProductListItem): void;
  onDecreaseBuildListQuantity(product: ProductListItem): void;
}

// 組裝單筆商品列的可互動內容，並把配單增減事件交回頁面狀態管理。
export function ProductRow({
  buildListQuantity,
  detailHref,
  isProductLimitReached,
  product,
  onAddToBuildList,
  onDecreaseBuildListQuantity,
}: ProductRowProps) {
  const priceMovementIsEmpty = isPriceMovementEmpty(product.priceMovement);
  const isInBuildList = buildListQuantity > 0;
  const canIncreaseBuildListQuantity = buildListQuantity < BUILD_LIST_MAX_QUANTITY;

  return (
    <article className={`product-row${isInBuildList ? " is-in-build-list" : ""}`}>
      <ProductImage fallbackLabel={product.category.displayName} image={product.image} />
      <div className="product-main">
        <Link href={detailHref} title={product.name}>
          {product.name}
        </Link>
      </div>
      <div className="table-cell row-price">
        <span className="cell-label">目前價格</span>
        <strong>{formatTwdPrice(product.price.amount)}</strong>
      </div>
      <div className={`table-cell row-movement${priceMovementIsEmpty ? " is-empty" : ""}`}>
        <span className="cell-label">近 {product.priceMovement.rangeDays} 天</span>
        <span className={`price-movement ${getPriceMovementTone(product.priceMovement)}`}>
          {formatPriceMovement(product.priceMovement)}
        </span>
      </div>
      <div className="table-cell row-status">
        <span className="cell-label">上架狀態</span>
        <span className={product.status.isActive ? "row-state ok" : "row-state warning"}>
          {product.status.isActive ? "目前上架" : "可能已下架"}
        </span>
      </div>
      <div className="table-cell row-build-list">
        <span className="cell-label">配單</span>
        {isInBuildList ? (
          <fieldset className="build-list-quantity-control">
            <legend className="sr-only">{product.name} 配單數量</legend>
            <button
              aria-label={
                buildListQuantity === 1
                  ? `從配單移除 ${product.name}`
                  : `減少 ${product.name} 的配單數量`
              }
              className="build-list-step-button"
              title={buildListQuantity === 1 ? "移除配單" : "減少數量"}
              type="button"
              onClick={() => onDecreaseBuildListQuantity(product)}
            >
              −
            </button>
            <span className="build-list-quantity-value">{buildListQuantity}</span>
            <button
              aria-label={`增加 ${product.name} 的配單數量`}
              className="build-list-step-button"
              disabled={!canIncreaseBuildListQuantity}
              title={
                canIncreaseBuildListQuantity ? "增加數量" : `最多 ${BUILD_LIST_MAX_QUANTITY} 件`
              }
              type="button"
              onClick={() => onAddToBuildList(product)}
            >
              +
            </button>
          </fieldset>
        ) : (
          <button
            className="build-list-add-button"
            disabled={isProductLimitReached}
            title={
              isProductLimitReached ? `配單已達 ${MAX_BUILD_LIST_PRODUCTS} 個品項` : "加入配單"
            }
            type="button"
            onClick={() => onAddToBuildList(product)}
          >
            {isProductLimitReached ? `已達 ${MAX_BUILD_LIST_PRODUCTS} 項` : "加入"}
          </button>
        )}
      </div>
    </article>
  );
}

function formatPriceMovement(movement: ProductListItem["priceMovement"]) {
  const deltaAmount = movement.deltaAmount;

  if (deltaAmount === null || deltaAmount === 0) {
    return "-";
  }

  if (movement.deltaPercent === null) {
    return formatSignedTwdPrice(deltaAmount);
  }

  return `${formatSignedTwdPrice(deltaAmount)} / ${formatSignedPercent(movement.deltaPercent)}`;
}

function formatSignedPercent(percent: number) {
  if (percent === 0) {
    return "0%";
  }

  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function getPriceMovementTone(movement: ProductListItem["priceMovement"]) {
  const deltaAmount = movement.deltaAmount;

  if (deltaAmount === null || deltaAmount === 0) {
    return "is-flat";
  }

  return deltaAmount < 0 ? "is-down" : "is-up";
}

function isPriceMovementEmpty(movement: ProductListItem["priceMovement"]) {
  return movement.deltaAmount === null || movement.deltaAmount === 0;
}
