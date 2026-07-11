// apps/web/app/build-list/refresh.ts
// 呼叫配單批次 refresh API，驗證 public response，並將失敗收斂成頁面狀態。

import { isRateLimitedApiError, toApiRequestError } from "../_shared/api-client";
import { MAX_BUILD_LIST_PRODUCTS } from "./constants";
import type { BuildListProductSnapshot } from "./model";
import {
  isRecord,
  normalizeIsoDate,
  toHttpUrl,
  toImageUrl,
  toNonEmptyString,
} from "./model/validation";
import { normalizeBuildListProductId } from "./product-id";

export interface BuildListRefreshSuccess {
  status: "ready";
  data: BuildListProductSnapshot[];
  missingProductIds: string[];
}

export type BuildListRefreshResult =
  | BuildListRefreshSuccess
  | { status: "rate_limited" | "error" | "aborted" };

type FetchBuildListRefresh = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function refreshBuildListProducts(
  productIds: string[],
  options: {
    signal?: AbortSignal;
    fetchImpl?: FetchBuildListRefresh;
  } = {},
): Promise<BuildListRefreshResult> {
  if (productIds.length === 0) {
    return { status: "ready", data: [], missingProductIds: [] };
  }

  if (productIds.length > MAX_BUILD_LIST_PRODUCTS) {
    return { status: "error" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl("/api/build-list/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productIds),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await toApiRequestError(response, "Failed to refresh build list.");

      return { status: isRateLimitedApiError(error) ? "rate_limited" : "error" };
    }

    const result = normalizeBuildListRefreshResponse(await response.json(), productIds);

    return result ?? { status: "error" };
  } catch {
    return options.signal?.aborted ? { status: "aborted" } : { status: "error" };
  }
}

export function normalizeBuildListRefreshResponse(
  value: unknown,
  requestedProductIds: string[],
): BuildListRefreshSuccess | null {
  if (!isRecord(value) || !Array.isArray(value.data) || !Array.isArray(value.missingProductIds)) {
    return null;
  }

  const requestedProductIdSet = new Set(requestedProductIds);
  const productsById = new Map<string, BuildListProductSnapshot>();

  for (const candidate of value.data) {
    const product = normalizeBuildListProductSnapshot(candidate);

    if (!product || !requestedProductIdSet.has(product.id) || productsById.has(product.id)) {
      return null;
    }

    productsById.set(product.id, product);
  }

  const missingProductIds: string[] = [];
  const missingProductIdSet = new Set<string>();

  for (const candidate of value.missingProductIds) {
    const productId = normalizeBuildListProductId(candidate);

    if (
      !productId ||
      !requestedProductIdSet.has(productId) ||
      productsById.has(productId) ||
      missingProductIdSet.has(productId)
    ) {
      return null;
    }

    missingProductIdSet.add(productId);
    missingProductIds.push(productId);
  }

  if (productsById.size + missingProductIdSet.size !== requestedProductIdSet.size) {
    return null;
  }

  return {
    status: "ready",
    data: requestedProductIds.flatMap((productId) => {
      const product = productsById.get(productId);

      return product ? [product] : [];
    }),
    missingProductIds: requestedProductIds.filter((productId) =>
      missingProductIdSet.has(productId),
    ),
  };
}

function normalizeBuildListProductSnapshot(value: unknown): BuildListProductSnapshot | null {
  if (
    !isRecord(value) ||
    !isRecord(value.category) ||
    !isRecord(value.source) ||
    !isRecord(value.status)
  ) {
    return null;
  }

  const id = normalizeBuildListProductId(value.id);
  const name = toNonEmptyString(value.name);
  const categoryDisplayName = toNonEmptyString(value.category.displayName);
  const sourceUrl = toHttpUrl(value.source.url);
  const lastSeenAt = normalizeIsoDate(value.lastSeenAt);

  if (
    !id ||
    !name ||
    !categoryDisplayName ||
    !sourceUrl ||
    typeof value.status.isActive !== "boolean" ||
    !lastSeenAt
  ) {
    return null;
  }

  const image = normalizeBuildListProductImage(value.image, name);
  const price = normalizeBuildListProductPrice(value.price);

  if ((value.image !== null && !image) || (value.price !== null && !price)) {
    return null;
  }

  return {
    id,
    name,
    image,
    category: {
      displayName: categoryDisplayName,
    },
    price,
    source: {
      url: sourceUrl,
    },
    status: {
      isActive: value.status.isActive,
    },
    lastSeenAt,
  };
}

function normalizeBuildListProductImage(
  value: unknown,
  fallbackAlt: string,
): BuildListProductSnapshot["image"] {
  if (!isRecord(value)) {
    return null;
  }

  const url = toImageUrl(value.url);

  if (!url) {
    return null;
  }

  return {
    url,
    alt: toNonEmptyString(value.alt) ?? fallbackAlt,
  };
}

function normalizeBuildListProductPrice(value: unknown): BuildListProductSnapshot["price"] {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.amount !== "number" ||
    !Number.isSafeInteger(value.amount) ||
    value.amount < 0 ||
    value.currency !== "TWD"
  ) {
    return null;
  }

  return {
    amount: value.amount,
    currency: "TWD",
  };
}
