"use client";
// apps/web/app/products/[id]/product-detail.tsx

import Link from "next/link";
import FloatingBuildListLink from "../../build-list/FloatingBuildListLink";
import SiteDisclaimer from "../../site-disclaimer";
import ProductDetailActions from "./detail/ProductDetailActions";
import ProductDetailFacts from "./detail/ProductDetailFacts";
import ProductDetailMedia from "./detail/ProductDetailMedia";
import LinkHealthNotice from "./detail/link-health-notice";
import { useProductDetailViewModel } from "./detail/use-product-detail-view-model";
import PriceHistoryPanel from "./price-history-panel";

export default function ProductDetail({
  productId,
  returnHref,
}: {
  productId: string;
  returnHref: string;
}) {
  const viewModel = useProductDetailViewModel({
    productId,
    returnHref,
  });
  const { product, state } = viewModel.productLoad;

  return (
    <main className="detail-shell">
      <div className="detail-topbar">
        <Link className="back-link" href={viewModel.navigation.returnHref}>
          {viewModel.navigation.returnLabel}
        </Link>
        {state === "ready" && product ? (
          <span className="detail-category-chip">{product.category.displayName}</span>
        ) : null}
      </div>

      {state === "loading" || state === "idle" ? (
        <section className="detail-loading" aria-label="商品載入中">
          <span className="skeleton-box detail-image" />
          <span className="skeleton-box detail-title" />
          <span className="skeleton-box detail-line" />
        </section>
      ) : null}

      {state === "not-found" ? (
        <section className="detail-empty">
          <h1>這項商品目前無法顯示</h1>
          <p>商品可能已下架，或連結已失效。你可以返回查詢頁重新搜尋。</p>
        </section>
      ) : null}

      {state === "error" ? (
        <section className="detail-empty" role="alert">
          <h1>商品資料暫時無法載入</h1>
          <p>請稍後重新整理頁面再試一次。</p>
        </section>
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
              productName={product.name}
              purchaseUrl={product.source.url}
              shareStatusMessage={viewModel.share.statusMessage}
              sourceHealth={product.source.health}
              onAddToBuildList={viewModel.buildList.addCurrentProductToBuildList}
              onDecreaseBuildListQuantity={
                viewModel.buildList.decreaseCurrentProductBuildListQuantity
              }
              onShare={viewModel.share.shareCurrentProduct}
            />
            <LinkHealthNotice product={product} />
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
      <FloatingBuildListLink summary={viewModel.buildList.summary} />
      <SiteDisclaimer />
    </main>
  );
}
