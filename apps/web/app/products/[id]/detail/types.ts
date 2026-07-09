// apps/web/app/products/[id]/detail/types.ts
// 定義商品詳細頁使用的 API response、載入狀態與來源連結健康狀態型別。

// 商品詳細頁資料載入生命週期，供 detail hook 與頁面狀態切換共用。
export type ProductDetailLoadState = "idle" | "loading" | "ready" | "not-found" | "error";

// 目前商品詳細 API 暴露的來源連結健康狀態，後續可改由商品狀態訊號取代舊 link health 實作。
export type ProductLinkHealthStatus = "ok" | "broken" | "temporary_error";

// 商品詳細頁來源連結健康資料；目前只用 status 驅動 UI，技術細節欄位已列入後續 API 精簡。
export interface ProductLinkHealth {
  status: ProductLinkHealthStatus;
  checkedAt: string;
  httpStatus: number | null;
}

// 商品詳細頁前端使用的 public API response shape。
export interface ProductDetailBody {
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
  } | null;
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
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
  lastSeenAt: string;
}
