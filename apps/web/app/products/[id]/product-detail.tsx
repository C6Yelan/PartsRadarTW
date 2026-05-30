"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SourceStatus = "ok" | "stale" | "unavailable";
type LoadState = "idle" | "loading" | "ready" | "not-found" | "error";

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
  };
  source: {
    name: "coolpc";
    url: string;
  };
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
  lastSeenAt: string;
}

interface SourceStatusBody {
  source: "coolpc";
  status: SourceStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
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
  const [sourceStatus, setSourceStatus] = useState<SourceStatusBody | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setImageError(false);
    setProduct(null);

    Promise.all([
      fetch(`/api/products/${productId}`, { signal: controller.signal }),
      fetch("/api/source-status", { signal: controller.signal }),
    ])
      .then(async ([productResponse, sourceStatusResponse]) => {
        if (productResponse.status === 404) {
          setState("not-found");
          return;
        }

        if (!productResponse.ok) {
          throw new Error("Failed to load product.");
        }

        const nextProduct = (await productResponse.json()) as ProductDetailBody;
        setProduct(nextProduct);

        if (sourceStatusResponse.ok) {
          setSourceStatus((await sourceStatusResponse.json()) as SourceStatusBody);
        }

        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState("error");
      });

    return () => controller.abort();
  }, [productId]);

  return (
    <main className="detail-shell">
      <div className="detail-topbar">
        <Link className="back-link" href={returnHref}>
          返回查詢
        </Link>
        {sourceStatus ? <StatusBadge status={sourceStatus.status} /> : null}
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
          <p>商品可能已下架、資料尚未同步，或連結已失效。你可以返回查詢頁重新搜尋。</p>
        </section>
      ) : null}

      {state === "error" ? (
        <section className="detail-empty" role="alert">
          <h1>商品資料暫時無法載入</h1>
          <p>請稍後重新整理或檢查本機 API 與資料庫狀態。</p>
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
              // biome-ignore lint/performance/noImgElement: CoolPC image URLs are validated server-side; plain img keeps referrerPolicy explicit without enabling an image proxy.
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
            <p className="eyebrow">{product.category.sourceName}</p>
            <h1>{product.name}</h1>

            {!product.status.isActive ? (
              <div className="quiet-alert warning" role="status">
                此商品目前可能已下架，或暫時沒有出現在原價屋頁面。
              </div>
            ) : null}

            <div className="price-block">
              <span>目前價格</span>
              <strong>{formatPrice(product.price.amount)}</strong>
              <small>{product.price.currency}</small>
            </div>

            <dl className="detail-facts">
              <div>
                <dt>分類</dt>
                <dd>{product.category.displayName}</dd>
              </div>
              <div>
                <dt>價格資料更新</dt>
                <dd>{formatDateTime(product.price.capturedAt)}</dd>
              </div>
              {!product.status.isActive ? (
                <div>
                  <dt>最後在來源頁看到</dt>
                  <dd>{formatDateTime(product.lastSeenAt)}</dd>
                </div>
              ) : null}
              <div>
                <dt>上架狀態</dt>
                <dd>{product.status.isActive ? "目前上架" : "可能已下架"}</dd>
              </div>
            </dl>

            <a
              className="external-action"
              href={product.source.url}
              rel="noreferrer"
              target="_blank"
            >
              前往原價屋查看／購買
            </a>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function StatusBadge({ status }: { status: SourceStatus }) {
  return <span className={`status-badge ${status}`}>{sourceStatusLabel(status)}</span>;
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

function sourceStatusLabel(status: SourceStatus) {
  switch (status) {
    case "ok":
      return "正常";
    case "stale":
      return "最近未成功";
    case "unavailable":
      return "無可用資料";
  }
}
