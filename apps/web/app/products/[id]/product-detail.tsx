"use client";
// apps/web/app/products/[id]/product-detail.tsx

import Link from "next/link";
import { useEffect, useState } from "react";
import FloatingBuildListLink from "../../build-list/FloatingBuildListLink";
import { BUILD_LIST_MAX_QUANTITY, toBuildListProduct } from "../../build-list/model";
import { useBuildList } from "../../build-list/use-build-list";
import SiteDisclaimer from "../../site-disclaimer";
import PriceHistoryPanel, {
  type PriceHistoryLoadState,
  type PriceHistoryRange,
  type ProductPriceHistoryBody,
} from "./price-history-panel";

type LoadState = "idle" | "loading" | "ready" | "not-found" | "error";
type ProductLinkHealthStatus = "ok" | "broken" | "temporary_error";

interface ProductLinkHealth {
  status: ProductLinkHealthStatus;
  checkedAt: string;
  httpStatus: number | null;
}

interface ProductDetailBody {
  id: string;
  name: string;
  category: {
    id: string;
    igrp: number;
    displayName: string;
    sourceName: string;
  };
  image: {
    url: string;
    alt: string;
  };
  price: {
    amount: number;
    currency: "TWD";
    capturedAt: string;
    lastSeenAt: string;
  };
  source: {
    name: "coolpc";
    url: string;
    health: ProductLinkHealth | null;
  };
  introduction: {
    url: string;
    health: ProductLinkHealth | null;
  } | null;
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
  lastSeenAt: string;
}

export default function ProductDetail({
  productId,
  returnHref,
}: {
  productId: string;
  returnHref: string;
}) {
  const [state, setState] = useState<LoadState>("idle");
  const [product, setProduct] = useState<ProductDetailBody | null>(null);
  const [historyState, setHistoryState] = useState<PriceHistoryLoadState>("idle");
  const [priceHistory, setPriceHistory] = useState<ProductPriceHistoryBody | null>(null);
  const [historyRange, setHistoryRange] = useState<PriceHistoryRange>(90);
  const [imageError, setImageError] = useState(false);
  const {
    addBuildListProduct,
    quantityByProductId,
    removeBuildListItem,
    summary,
    setBuildListItemQuantity,
  } = useBuildList();
  const currentBuildListQuantity = product ? (quantityByProductId.get(product.id) ?? 0) : 0;
  const canIncreaseBuildListQuantity = currentBuildListQuantity < BUILD_LIST_MAX_QUANTITY;
  const returnLabel = returnHref.startsWith("/build-list") ? "返回配單" : "返回查詢";

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setHistoryState("idle");
    setImageError(false);
    setProduct(null);
    setPriceHistory(null);
    setHistoryRange(90);

    async function loadProductDetail() {
      try {
        const productResponse = await fetch(`/api/products/${productId}`, {
          signal: controller.signal,
        });

        if (productResponse.status === 404) {
          setState("not-found");
          return;
        }

        if (!productResponse.ok) {
          throw new Error("Failed to load product.");
        }

        const nextProduct = (await productResponse.json()) as ProductDetailBody;
        setProduct(nextProduct);
        setState("ready");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState("error");
      }
    }

    void loadProductDetail();

    return () => controller.abort();
  }, [productId]);

  useEffect(() => {
    if (!product) {
      return;
    }

    const controller = new AbortController();
    setHistoryState("loading");

    async function loadPriceHistory() {
      try {
        const historyResponse = await fetch(
          `/api/products/${productId}/price-history?${toPriceHistoryRangeQuery(historyRange)}`,
          {
            signal: controller.signal,
          },
        );

        if (historyResponse.status === 404) {
          setHistoryState("unavailable");
          return;
        }

        if (!historyResponse.ok) {
          throw new Error("Failed to load price history.");
        }

        setPriceHistory((await historyResponse.json()) as ProductPriceHistoryBody);
        setHistoryState("ready");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHistoryState("error");
      }
    }

    void loadPriceHistory();

    return () => controller.abort();
  }, [product, productId, historyRange]);

  function addCurrentProductToBuildList() {
    if (!product) {
      return;
    }

    addBuildListProduct(toBuildListProduct(product));
  }

  function decreaseCurrentProductBuildListQuantity() {
    if (!product || currentBuildListQuantity <= 0) {
      return;
    }

    if (currentBuildListQuantity === 1) {
      removeBuildListItem(product.id);
      return;
    }

    setBuildListItemQuantity(product.id, currentBuildListQuantity - 1);
  }

  return (
    <main className="detail-shell">
      <div className="detail-topbar">
        <Link className="back-link" href={returnHref}>
          {returnLabel}
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
          <div className="detail-media">
            {imageError ? (
              <div className="detail-image-fallback" aria-label="圖片暫時無法顯示" role="img">
                <span className="image-fallback-copy">
                  <strong>圖片暫時無法顯示</strong>
                  <small>{product.category.displayName}</small>
                </span>
              </div>
            ) : (
              // biome-ignore lint/performance/noImgElement: Product images are served by the local API; plain img keeps the fallback path direct.
              <img
                alt={product.image.alt}
                draggable={false}
                referrerPolicy="no-referrer"
                src={product.image.url}
                onContextMenu={(event) => event.preventDefault()}
                onError={() => setImageError(true)}
              />
            )}
          </div>

          <div className="detail-content">
            <h1>{product.name}</h1>

            {!product.status.isActive ? (
              <div className="quiet-alert warning" role="status">
                這項商品目前沒有出現在原價屋列表，可能已下架或暫時無法確認。
              </div>
            ) : null}

            <div className="price-block">
              <span>目前價格</span>
              <strong>{formatPrice(product.price.amount)}</strong>
            </div>

            <dl className="detail-facts">
              <div>
                <dt>價格資料更新</dt>
                <dd>{formatDateTime(product.price.lastSeenAt)}</dd>
              </div>
              {!product.status.isActive ? (
                <div>
                  <dt>最後在原價屋看到</dt>
                  <dd>{formatDateTime(product.lastSeenAt)}</dd>
                </div>
              ) : null}
              <div>
                <dt>上架狀態</dt>
                <dd>{product.status.isActive ? "目前上架" : "可能已下架"}</dd>
              </div>
            </dl>

            <div
              className={`detail-actions ${
                product.introduction ? "has-introduction" : "without-introduction"
              }`}
            >
              {currentBuildListQuantity > 0 ? (
                <fieldset className="build-list-quantity-control build-list-detail-quantity">
                  <legend className="sr-only">{product.name} 配單數量</legend>
                  <button
                    aria-label={
                      currentBuildListQuantity === 1
                        ? `從配單移除 ${product.name}`
                        : `減少 ${product.name} 的配單數量`
                    }
                    className="build-list-step-button"
                    title={currentBuildListQuantity === 1 ? "移除配單" : "減少數量"}
                    type="button"
                    onClick={decreaseCurrentProductBuildListQuantity}
                  >
                    −
                  </button>
                  <span className="build-list-quantity-value">{currentBuildListQuantity}</span>
                  <button
                    aria-label={`增加 ${product.name} 的配單數量`}
                    className="build-list-step-button"
                    disabled={!canIncreaseBuildListQuantity}
                    title={
                      canIncreaseBuildListQuantity
                        ? "增加數量"
                        : `最多 ${BUILD_LIST_MAX_QUANTITY} 件`
                    }
                    type="button"
                    onClick={addCurrentProductToBuildList}
                  >
                    +
                  </button>
                </fieldset>
              ) : (
                <button
                  className="build-list-detail-action"
                  type="button"
                  onClick={addCurrentProductToBuildList}
                >
                  加入配單
                </button>
              )}
              <a
                aria-label="前往原價屋查看／購買，開新分頁"
                className={toExternalActionClassName(product.source.health)}
                href={product.source.url}
                rel="noreferrer"
                target="_blank"
              >
                前往購買
              </a>
              {product.introduction ? (
                <a
                  aria-label="產品介紹，開新分頁"
                  className={toExternalActionClassName(product.introduction.health, "secondary")}
                  href={product.introduction.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  產品介紹
                </a>
              ) : null}
            </div>
            {renderLinkHealthNotice(product)}
          </div>
        </section>
      ) : null}

      {state === "ready" && product ? (
        <PriceHistoryPanel
          history={priceHistory}
          selectedRange={historyRange}
          state={historyState}
          onRangeChange={setHistoryRange}
        />
      ) : null}
      <FloatingBuildListLink summary={summary} />
      <SiteDisclaimer />
    </main>
  );
}

function toPriceHistoryRangeQuery(range: PriceHistoryRange) {
  return range === "all" ? "range=all" : `days=${range}`;
}

function formatPrice(amount: number) {
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function toExternalActionClassName(
  health: ProductLinkHealth | null,
  extraClassName?: "secondary",
) {
  return [
    "external-action",
    extraClassName,
    health && health.status !== "ok" ? "needs-link-check" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function renderLinkHealthNotice(product: ProductDetailBody) {
  const notices = [
    toLinkHealthNotice("原價屋連結", product.source.health),
    product.introduction
      ? toLinkHealthNotice("產品介紹連結", product.introduction.health)
      : null,
  ].filter((notice): notice is string => Boolean(notice));

  if (notices.length === 0) {
    return null;
  }

  return (
    <p className="link-health-note" role="status">
      {notices.join("　")}
    </p>
  );
}

function toLinkHealthNotice(label: string, health: ProductLinkHealth | null) {
  if (!health || health.status === "ok") {
    return null;
  }

  return health.status === "broken"
    ? `${label}可能已失效`
    : `${label}暫時無法確認`;
}
