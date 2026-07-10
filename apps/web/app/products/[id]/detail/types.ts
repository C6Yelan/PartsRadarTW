// apps/web/app/products/[id]/detail/types.ts
// 定義商品詳細頁使用的 API response 與載入狀態型別。

// 商品詳細頁資料載入生命週期，供 detail hook 與頁面狀態切換共用。
export type ProductDetailLoadState = "idle" | "loading" | "ready" | "not-found" | "error";

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
  };
  status: {
    isActive: boolean;
  };
  lastSeenAt: string;
}
