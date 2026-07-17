// apps/web/app/build-list/model.ts
// 定義配單 intent、暫存 refresh snapshot 與數量、排序、摘要純函式。

import { normalizeProductId } from "../_shared/product-id";
import { BUILD_LIST_MAX_QUANTITY, MAX_BUILD_LIST_PRODUCTS } from "./constants";
import { isRecord, normalizeIsoDate } from "./model/validation";

export interface BuildListIntent {
  productId: string;
  quantity: number;
  includeInExport: boolean;
  order: number;
  addedAt: string;
  updatedAt: string;
}

export interface BuildListProductSnapshot {
  id: string;
  name: string;
  image: {
    url: string;
    alt: string;
  } | null;
  category: {
    displayName: string;
  };
  price: {
    amount: number;
    currency: "TWD";
  } | null;
  source: {
    url: string;
  };
  status: {
    isActive: boolean;
    isExcluded: boolean;
    exclusionReason: "misclassified_bundle_product" | "conditional_add_on" | null;
  };
  lastSeenAt: string;
}

export type BuildListRefreshState = "idle" | "loading" | "ready" | "rate_limited" | "error";
export type BuildListItemAvailability = "loading" | "available" | "missing" | "unavailable";

export interface BuildListItem {
  intent: BuildListIntent;
  product: BuildListProductSnapshot | null;
  availability: BuildListItemAvailability;
}

export interface BuildListIntentSummary {
  itemCount: number;
  totalQuantity: number;
}

export interface BuildListSummary extends BuildListIntentSummary {
  totalAmount: number;
  unpricedItemCount: number;
  activeItemCount: number;
  inactiveItemCount: number;
  missingItemCount: number;
  unavailableItemCount: number;
  exportItemCount: number;
}

export interface BuildListCategorySummary {
  label: string;
  itemCount: number;
  totalQuantity: number;
}

export function addProductToBuildList(
  intents: BuildListIntent[],
  productId: string,
  now = new Date(),
): BuildListIntent[] {
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) {
    return intents;
  }

  const existingIntent = intents.find((intent) => intent.productId === normalizedProductId);
  const updatedAt = now.toISOString();

  if (existingIntent) {
    return intents.map((intent) =>
      intent.productId === normalizedProductId
        ? {
            ...intent,
            quantity: clampBuildListQuantity(intent.quantity + 1),
            updatedAt,
          }
        : intent,
    );
  }

  if (intents.length >= MAX_BUILD_LIST_PRODUCTS) {
    return intents;
  }

  const nextOrder = intents.reduce((maxOrder, intent) => Math.max(maxOrder, intent.order), -1) + 1;

  return [
    ...intents,
    {
      productId: normalizedProductId,
      quantity: 1,
      includeInExport: true,
      order: nextOrder,
      addedAt: updatedAt,
      updatedAt,
    },
  ];
}

export function updateBuildListItemQuantity(
  intents: BuildListIntent[],
  productId: string,
  quantity: number,
  now = new Date(),
): BuildListIntent[] {
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) {
    return intents;
  }

  const updatedAt = now.toISOString();

  return intents.map((intent) =>
    intent.productId === normalizedProductId
      ? {
          ...intent,
          quantity: clampBuildListQuantity(quantity),
          updatedAt,
        }
      : intent,
  );
}

export function updateBuildListItemExportSelection(
  intents: BuildListIntent[],
  productId: string,
  includeInExport: boolean,
  now = new Date(),
): BuildListIntent[] {
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) return intents;

  return intents.map((intent) =>
    intent.productId === normalizedProductId
      ? { ...intent, includeInExport, updatedAt: now.toISOString() }
      : intent,
  );
}

export function removeBuildListItem(
  intents: BuildListIntent[],
  productId: string,
): BuildListIntent[] {
  return intents.filter((intent) => intent.productId !== productId);
}

export function restoreBuildListItem(
  intents: BuildListIntent[],
  restoredIntent: BuildListIntent,
): BuildListIntent[] {
  const normalizedRestoredIntent = normalizeBuildListIntent(restoredIntent);

  if (!normalizedRestoredIntent) {
    return intents;
  }

  const existingIndex = intents.findIndex(
    (intent) => intent.productId === normalizedRestoredIntent.productId,
  );

  if (existingIndex === -1 && intents.length >= MAX_BUILD_LIST_PRODUCTS) {
    return intents;
  }

  const hasOrderCollision = intents.some(
    (intent) => intent.order === normalizedRestoredIntent.order,
  );
  const restoredIntents =
    existingIndex === -1
      ? [
          ...intents.map((intent) =>
            hasOrderCollision && intent.order >= normalizedRestoredIntent.order
              ? { ...intent, order: intent.order + 1 }
              : intent,
          ),
          normalizedRestoredIntent,
        ]
      : intents.map((intent, index) =>
          index === existingIndex ? normalizedRestoredIntent : intent,
        );

  return sortBuildListIntents(restoredIntents);
}

export function summarizeBuildListIntents(intents: BuildListIntent[]): BuildListIntentSummary {
  return intents.reduce(
    (summary, intent) => ({
      itemCount: summary.itemCount + 1,
      totalQuantity: summary.totalQuantity + intent.quantity,
    }),
    {
      itemCount: 0,
      totalQuantity: 0,
    },
  );
}

export function resolveBuildListItems(
  intents: BuildListIntent[],
  products: BuildListProductSnapshot[],
  refreshState: BuildListRefreshState,
): BuildListItem[] {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return intents.map((intent) => {
    const product = productsById.get(intent.productId) ?? null;

    return {
      intent,
      product,
      availability: getBuildListItemAvailability(product, refreshState),
    };
  });
}

export function summarizeBuildListItems(items: BuildListItem[]): BuildListSummary {
  return items.reduce(
    (summary, item) => {
      const subtotal = getBuildListLineSubtotal(item);

      return {
        itemCount: summary.itemCount + 1,
        totalQuantity: summary.totalQuantity + item.intent.quantity,
        totalAmount: summary.totalAmount + (subtotal ?? 0),
        unpricedItemCount: summary.unpricedItemCount + (subtotal === null ? 1 : 0),
        activeItemCount:
          summary.activeItemCount +
          (item.product?.status.isActive && !item.product.status.isExcluded ? 1 : 0),
        inactiveItemCount:
          summary.inactiveItemCount +
          (item.product && !item.product.status.isActive && !item.product.status.isExcluded
            ? 1
            : 0),
        missingItemCount: summary.missingItemCount + (item.availability === "missing" ? 1 : 0),
        unavailableItemCount:
          summary.unavailableItemCount + (item.availability === "unavailable" ? 1 : 0),
        exportItemCount: summary.exportItemCount + (item.intent.includeInExport ? 1 : 0),
      };
    },
    {
      itemCount: 0,
      totalQuantity: 0,
      totalAmount: 0,
      unpricedItemCount: 0,
      activeItemCount: 0,
      inactiveItemCount: 0,
      missingItemCount: 0,
      unavailableItemCount: 0,
      exportItemCount: 0,
    },
  );
}

export function summarizeBuildListCategories(items: BuildListItem[]): BuildListCategorySummary[] {
  const categories = new Map<string, BuildListCategorySummary>();

  for (const item of items) {
    const label = item.product?.category.displayName;

    if (!label) {
      continue;
    }

    const current = categories.get(label);
    if (current) {
      current.itemCount += 1;
      current.totalQuantity += item.intent.quantity;
    } else {
      categories.set(label, {
        label,
        itemCount: 1,
        totalQuantity: item.intent.quantity,
      });
    }
  }

  return [...categories.values()];
}

export function getBuildListLineSubtotal(item: BuildListItem): number | null {
  return item.product?.price ? item.product.price.amount * item.intent.quantity : null;
}

export function normalizeBuildListIntents(value: unknown): BuildListIntent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const intentsByProductId = new Map<string, BuildListIntent>();

  for (const candidate of value) {
    const intent = normalizeBuildListIntent(candidate);

    if (intent && !intentsByProductId.has(intent.productId)) {
      intentsByProductId.set(intent.productId, intent);
    }
  }

  return sortBuildListIntents([...intentsByProductId.values()]).slice(0, MAX_BUILD_LIST_PRODUCTS);
}

export function clampBuildListQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(quantity), 1), BUILD_LIST_MAX_QUANTITY);
}

function normalizeBuildListIntent(value: unknown): BuildListIntent | null {
  if (!isRecord(value)) {
    return null;
  }

  const productId = normalizeProductId(value.productId);
  const addedAt = normalizeIsoDate(value.addedAt);
  const updatedAt = normalizeIsoDate(value.updatedAt);
  const order = value.order;
  const quantity = value.quantity;
  const includeInExport = value.includeInExport;

  if (
    !productId ||
    !addedAt ||
    !updatedAt ||
    typeof order !== "number" ||
    !Number.isSafeInteger(order) ||
    order < 0 ||
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    typeof includeInExport !== "boolean"
  ) {
    return null;
  }

  return {
    productId,
    quantity: clampBuildListQuantity(quantity),
    includeInExport,
    order,
    addedAt,
    updatedAt,
  };
}

function sortBuildListIntents(intents: BuildListIntent[]): BuildListIntent[] {
  return [...intents].sort(
    (left, right) => left.order - right.order || left.productId.localeCompare(right.productId),
  );
}

function getBuildListItemAvailability(
  product: BuildListProductSnapshot | null,
  refreshState: BuildListRefreshState,
): BuildListItemAvailability {
  if (product) {
    return "available";
  }

  if (refreshState === "ready") {
    return "missing";
  }

  if (refreshState === "idle" || refreshState === "loading") {
    return "loading";
  }

  return "unavailable";
}
