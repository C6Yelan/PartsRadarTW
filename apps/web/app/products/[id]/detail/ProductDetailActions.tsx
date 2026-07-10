"use client";

// apps/web/app/products/[id]/detail/ProductDetailActions.tsx
// 顯示商品詳細頁的配單操作、來源購買連結與分享操作區塊。

import { CopyIcon, ExternalLinkIcon } from "../../../_shared/icons";
import { BUILD_LIST_MAX_QUANTITY, MAX_BUILD_LIST_PRODUCTS } from "../../../build-list/model";

// 組裝商品詳細頁主要操作，依配單狀態切換加入按鈕或數量控制。
export default function ProductDetailActions({
  canIncreaseBuildListQuantity,
  currentBuildListQuantity,
  isProductLimitReached,
  onAddToBuildList,
  onDecreaseBuildListQuantity,
  onCopyLink,
  productName,
  shareStatusMessage,
  purchaseUrl,
}: {
  canIncreaseBuildListQuantity: boolean;
  currentBuildListQuantity: number;
  isProductLimitReached: boolean;
  onAddToBuildList: () => void;
  onDecreaseBuildListQuantity: () => void;
  onCopyLink: () => void;
  productName: string;
  shareStatusMessage: string | null;
  purchaseUrl: string;
}) {
  return (
    <div className="detail-actions">
      <div className="detail-primary-actions">
        {currentBuildListQuantity > 0 ? (
          <fieldset className="build-list-quantity-control build-list-detail-quantity">
            <legend className="sr-only">{productName} 配單數量</legend>
            <button
              aria-label={
                currentBuildListQuantity === 1
                  ? `從配單移除 ${productName}`
                  : `減少 ${productName} 的配單數量`
              }
              className="build-list-step-button"
              title={currentBuildListQuantity === 1 ? "移除配單" : "減少數量"}
              type="button"
              onClick={onDecreaseBuildListQuantity}
            >
              −
            </button>
            <span className="build-list-quantity-value">{currentBuildListQuantity}</span>
            <button
              aria-label={`增加 ${productName} 的配單數量`}
              className="build-list-step-button"
              disabled={!canIncreaseBuildListQuantity}
              title={
                canIncreaseBuildListQuantity ? "增加數量" : `最多 ${BUILD_LIST_MAX_QUANTITY} 件`
              }
              type="button"
              onClick={onAddToBuildList}
            >
              +
            </button>
          </fieldset>
        ) : (
          <button
            className="build-list-detail-action"
            disabled={isProductLimitReached}
            title={
              isProductLimitReached ? `配單已達 ${MAX_BUILD_LIST_PRODUCTS} 個品項` : "加入配單"
            }
            type="button"
            onClick={onAddToBuildList}
          >
            {isProductLimitReached ? `配單已達 ${MAX_BUILD_LIST_PRODUCTS} 個品項` : "加入配單"}
          </button>
        )}
      </div>
      <div className="detail-link-actions">
        <a
          aria-label="前往原價屋查看／購買，開新分頁"
          className="external-action"
          href={purchaseUrl}
          rel="noreferrer"
          target="_blank"
        >
          前往購買
          <ExternalLinkIcon className="detail-action-icon" />
        </a>
        <button
          aria-label="複製商品連結"
          className="detail-share-action"
          type="button"
          onClick={onCopyLink}
        >
          <CopyIcon className="detail-action-icon" />
          複製連結
        </button>
      </div>
      {shareStatusMessage ? (
        <p className="detail-share-status" aria-live="polite">
          {shareStatusMessage}
        </p>
      ) : null}
    </div>
  );
}
