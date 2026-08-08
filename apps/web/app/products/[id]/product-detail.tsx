"use client";
// apps/web/app/products/[id]/product-detail.tsx
// 組裝商品詳細頁 client 介面，串接商品資料、配單操作與價格歷史。

import Link from "next/link";
import { API_RATE_LIMITED_MESSAGE } from "../../_shared/api-client";
import { ArrowLeftIcon } from "../../_shared/icons";
import SiteDisclaimer from "../../site-disclaimer";
import TopbarBrandNavigation from "../../TopbarBrandNavigation";
import ProductDetailActions from "./detail/ProductDetailActions";
import ProductDetailFacts from "./detail/ProductDetailFacts";
import ProductDetailMedia from "./detail/ProductDetailMedia";
import type { ProductDetailBody, ProductDetailLoadState } from "./detail/types";
import { useProductDetailViewModel } from "./detail/use-product-detail-view-model";
import PriceHistoryPanel from "./price-history-panel";

// 呈現商品詳細頁主要內容，依 view model 的載入狀態切換 loading、錯誤、空狀態與完整商品資訊。
export default function ProductDetail({
  initialProduct,
  productId,
  returnHref,
}: {
  initialProduct: ProductDetailBody;
  productId: string;
  returnHref: string;
}) {
  const viewModel = useProductDetailViewModel({
    initialProduct,
    productId,
    returnHref,
  });
  const { product, state } = viewModel.productLoad;

  return (
    <div className="app-shell">
      <header className="topbar public-info-topbar">
        <TopbarBrandNavigation />
        <div className="public-info-topbar-title">
          <h1>商品資訊</h1>
        </div>
        <Link className="back-link public-info-back-link" href={viewModel.navigation.returnHref}>
          <ArrowLeftIcon />
          {viewModel.navigation.returnLabel}
        </Link>
      </header>
      <main className="detail-shell">
        {state === "loading" || state === "idle" ? (
          <section className="detail-loading" aria-label="商品載入中">
            <span className="skeleton-box detail-image" />
            <span className="skeleton-box detail-title" />
            <span className="skeleton-box detail-line" />
          </section>
        ) : null}

        {state === "not-found" ? <ProductDetailNotFoundState /> : null}

        {state === "error" || state === "rate_limited" ? (
          <ProductDetailErrorState state={state} />
        ) : null}

        {state === "ready" && product ? (
          <section className="detail-layout">
            <ProductDetailMedia
              imageError={viewModel.media.imageError}
              product={product}
              onImageError={viewModel.media.onImageError}
            />

            <div className="detail-content">
              <h1>{product.name}</h1>

              <ProductDetailFacts product={product} />
              <ProductDetailActions
                canIncreaseBuildListQuantity={viewModel.buildList.canIncreaseBuildListQuantity}
                currentBuildListQuantity={viewModel.buildList.currentBuildListQuantity}
                isProductLimitReached={viewModel.buildList.isProductLimitReached}
                productName={product.name}
                purchaseUrl={product.source.url}
                shareStatusMessage={viewModel.share.statusMessage}
                onAddToBuildList={viewModel.buildList.addCurrentProductToBuildList}
                onDecreaseBuildListQuantity={
                  viewModel.buildList.decreaseCurrentProductBuildListQuantity
                }
                onCopyLink={viewModel.share.copyCurrentProductLink}
              />
            </div>
          </section>
        ) : null}

        {state === "ready" && product ? (
          <PriceHistoryPanel
            history={viewModel.priceHistory.history}
            selectedRange={viewModel.priceHistory.selectedRange}
            state={viewModel.priceHistory.state}
            onRangeChange={viewModel.priceHistory.onRangeChange}
          />
        ) : null}
        <SiteDisclaimer />
      </main>
    </div>
  );
}

export function ProductDetailNotFoundState() {
  return (
    <section className="detail-empty">
      <h1>找不到這項商品，或目前無法公開顯示</h1>
      <p>請返回查詢頁重新搜尋，或稍後再試。</p>
    </section>
  );
}

export function ProductDetailErrorState({
  state,
}: {
  state: Extract<ProductDetailLoadState, "error" | "rate_limited">;
}) {
  return (
    <section className="detail-empty" role="alert">
      <h1>商品資料暫時無法載入</h1>
      <p>{state === "rate_limited" ? API_RATE_LIMITED_MESSAGE : "請稍後重新整理頁面再試一次。"}</p>
    </section>
  );
}
