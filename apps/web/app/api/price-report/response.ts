// apps/web/app/api/price-report/response.ts
// 將共用 reader 結果轉為穩定、可分頁且不暴露 crawler 欄位的公開 JSON。

import type { RecentPriceReport } from "@partsradar/db/price-report";
import { createPublicProductImagePath } from "@partsradar/shared";

import { getCategorySlug, type CategorySlug } from "../../category-slugs";
import type { SourceStatusResponseBody } from "../source-status/response";
import type {
  PriceReportQuery,
  PriceReportSort,
  PriceReportType,
  PriceReportWindow,
} from "./query";

export interface PriceReportResponseItem {
  productId: string;
  productName: string;
  image: {
    url: string;
    alt: string;
  } | null;
  category: {
    igrp: number;
    slug: CategorySlug | null;
    displayName: string;
  };
  kind: PriceReportType;
  previousPrice: number | null;
  currentPrice: number;
  currency: string;
  deltaAmount: number | null;
  deltaPercent: number | null;
  changedAt: string;
}

export interface PriceReportResponseBody {
  data: PriceReportResponseItem[];
  summary: {
    dropCount: number;
    riseCount: number;
    newProductCount: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    window: PriceReportWindow;
    since: string;
    until: string;
    sourceStatus: SourceStatusResponseBody["status"];
    lastSuccessAt: string | null;
  };
}

export interface PriceReportProductImageRecord {
  id: string;
  primaryImageUrl: string | null;
  imageCachedAt: Date | null;
}

interface BuildPriceReportResponseOptions {
  query: PriceReportQuery;
  since: Date;
  until: Date;
  sourceStatus: Pick<SourceStatusResponseBody, "status" | "lastSuccessAt">;
}

export function buildPriceReportResponse(
  report: RecentPriceReport,
  options: BuildPriceReportResponseOptions,
): PriceReportResponseBody {
  const items = [
    ...report.priceChanges.map(
      (item): PriceReportResponseItem => ({
        productId: item.productId,
        productName: item.productName,
        image: null,
        category: {
          igrp: item.category.igrp,
          slug: getCategorySlug(item.category.igrp),
          displayName: item.category.displayName,
        },
        kind: item.delta < 0 ? "drop" : "rise",
        previousPrice: item.previousPrice,
        currentPrice: item.currentPrice,
        currency: item.currency,
        deltaAmount: item.delta,
        deltaPercent: getDeltaPercent(item.delta, item.previousPrice),
        changedAt: item.changedAt.toISOString(),
      }),
    ),
    ...report.newProducts.map(
      (item): PriceReportResponseItem => ({
        productId: item.productId,
        productName: item.productName,
        image: null,
        category: {
          igrp: item.category.igrp,
          slug: getCategorySlug(item.category.igrp),
          displayName: item.category.displayName,
        },
        kind: "new",
        previousPrice: null,
        currentPrice: item.currentPrice,
        currency: item.currency,
        deltaAmount: null,
        deltaPercent: null,
        changedAt: item.firstSeenAt.toISOString(),
      }),
    ),
  ];

  items.sort((left, right) => compareItems(left, right, options.query.sort));

  const totalItems = items.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / options.query.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(options.query.page, totalPages);
  const offset = (page - 1) * options.query.pageSize;

  return {
    data: items.slice(offset, offset + options.query.pageSize),
    summary: {
      dropCount: items.filter((item) => item.kind === "drop").length,
      riseCount: items.filter((item) => item.kind === "rise").length,
      newProductCount: items.filter((item) => item.kind === "new").length,
    },
    pagination: {
      page,
      pageSize: options.query.pageSize,
      totalItems,
      totalPages,
    },
    meta: {
      window: options.query.window,
      since: options.since.toISOString(),
      until: options.until.toISOString(),
      sourceStatus: options.sourceStatus.status,
      lastSuccessAt: options.sourceStatus.lastSuccessAt,
    },
  };
}

export function attachPriceReportImages(
  response: PriceReportResponseBody,
  products: readonly PriceReportProductImageRecord[],
): PriceReportResponseBody {
  const productNames = new Map(response.data.map((item) => [item.productId, item.productName]));
  const imagesByProductId = new Map(
    products.map((product) => [
      product.id,
      product.primaryImageUrl && product.imageCachedAt
        ? {
            url: createPublicProductImagePath(product.id),
            alt: productNames.get(product.id) ?? "商品圖片",
          }
        : null,
    ]),
  );

  return {
    ...response,
    data: response.data.map((item) => ({
      ...item,
      image: imagesByProductId.get(item.productId) ?? null,
    })),
  };
}

function getDeltaPercent(delta: number, previousPrice: number): number | null {
  if (previousPrice === 0) {
    return null;
  }

  return Math.round((delta / previousPrice) * 10_000) / 100;
}

function compareItems(
  left: PriceReportResponseItem,
  right: PriceReportResponseItem,
  sort: PriceReportSort,
): number {
  const leftSortValue = getSortValue(left, sort);
  const rightSortValue = getSortValue(right, sort);

  if (leftSortValue !== rightSortValue) {
    if (leftSortValue === Number.NEGATIVE_INFINITY) {
      return 1;
    }

    if (rightSortValue === Number.NEGATIVE_INFINITY) {
      return -1;
    }

    return rightSortValue - leftSortValue;
  }

  const timeDifference = Date.parse(right.changedAt) - Date.parse(left.changedAt);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  const nameDifference = left.productName.localeCompare(right.productName, "zh-Hant");
  return nameDifference !== 0 ? nameDifference : left.productId.localeCompare(right.productId);
}

function getSortValue(item: PriceReportResponseItem, sort: PriceReportSort): number {
  if (sort === "drop_percent_desc") {
    return item.kind === "drop" ? Math.abs(item.deltaPercent ?? 0) : Number.NEGATIVE_INFINITY;
  }

  if (sort === "rise_percent_desc") {
    return item.kind === "rise" ? (item.deltaPercent ?? 0) : Number.NEGATIVE_INFINITY;
  }

  if (sort === "delta_amount_desc") {
    return Math.abs(item.deltaAmount ?? 0);
  }

  return Date.parse(item.changedAt);
}
