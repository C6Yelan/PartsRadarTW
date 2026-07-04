// apps/web/app/products/[id]/detail/types.ts
export type ProductDetailLoadState = "idle" | "loading" | "ready" | "not-found" | "error";
export type ProductLinkHealthStatus = "ok" | "broken" | "temporary_error";

export interface ProductLinkHealth {
  status: ProductLinkHealthStatus;
  checkedAt: string;
  httpStatus: number | null;
}

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
