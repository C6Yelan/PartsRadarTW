// apps/crawler/src/scripts/ops/product-link-checker/types.ts

import type { Prisma } from "@partsradar/db";
import type { ProductLinkCheckerOptions } from "./options";

export const PRODUCT_LINK_KINDS = {
  // SOURCE matches the public API source.url purchase link, not products.source_url.
  SOURCE: "SOURCE",
} as const;

export const PRODUCT_LINK_HEALTH_STATUSES = {
  OK: "OK",
  BROKEN: "BROKEN",
  TEMPORARY_ERROR: "TEMPORARY_ERROR",
} as const;

export type ProductLinkKindValue =
  (typeof PRODUCT_LINK_KINDS)[keyof typeof PRODUCT_LINK_KINDS];
export type ProductLinkHealthStatusValue =
  (typeof PRODUCT_LINK_HEALTH_STATUSES)[keyof typeof PRODUCT_LINK_HEALTH_STATUSES];

export const PRODUCT_LINK_SELECT = {
  id: true,
  name: true,
  ibuyToken: true,
  sourceCategory: {
    select: {
      igrp: true,
      displayName: true,
    },
  },
  linkHealthChecks: {
    select: {
      linkKind: true,
      url: true,
      status: true,
      httpStatus: true,
      checkedAt: true,
      lastOkAt: true,
      lastFailureAt: true,
      failureCount: true,
    },
  },
} as const satisfies Prisma.ProductSelect;

export type ProductLinkProductRecord = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_LINK_SELECT;
}>;
export type ProductLinkHealthRecord = ProductLinkProductRecord["linkHealthChecks"][number];

export type ProductLinkFindManyArgs = Omit<Prisma.ProductFindManyArgs, "select"> & {
  select: typeof PRODUCT_LINK_SELECT;
};

export interface ProductLinkHealthWriteData {
  url: string;
  status: ProductLinkHealthStatusValue;
  httpStatus: number | null;
  checkedAt: Date;
  lastOkAt: Date | null;
  lastFailureAt: Date | null;
  failureCount: number;
  errorMessage: string | null;
}

export interface ProductLinkHealthUpsertArgs {
  where: {
    productId_linkKind: {
      productId: string;
      linkKind: ProductLinkKindValue;
    };
  };
  create: ProductLinkHealthWriteData & {
    productId: string;
    linkKind: ProductLinkKindValue;
  };
  update: ProductLinkHealthWriteData;
  select: { id: true };
}

export interface ProductLinkHealthClient {
  product: {
    findMany(args: ProductLinkFindManyArgs): Promise<ProductLinkProductRecord[]>;
  };
  productLinkHealth: {
    upsert(args: ProductLinkHealthUpsertArgs): Promise<{ id: string }>;
  };
}

export interface ProductLinkCandidate {
  productId: string;
  productName: string;
  categoryLabel: string;
  linkKind: ProductLinkKindValue;
  url: string;
  existingHealth: ProductLinkHealthRecord | null;
}

export interface LinkCheckOutcome {
  status: "ok" | "broken" | "temporary_error";
  httpStatus: number | null;
  errorMessage: string | null;
}

export interface ProductLinkCheckerDependencies {
  fetchLink?: (url: string, options: ProductLinkCheckerOptions) => Promise<LinkCheckOutcome>;
  delay?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  debugLog?: (message: string) => void;
  now?: () => Date;
  shouldPause?: () => Promise<boolean> | boolean;
}
