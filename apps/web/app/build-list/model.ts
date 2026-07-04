// apps/web/app/build-list/model.ts
import {
  isRecord,
  normalizeIsoDate,
  toHttpUrl,
  toImageUrl,
  toNonEmptyString,
  toNumber,
} from "./model/validation";

export const BUILD_LIST_MAX_QUANTITY = 99;

export interface BuildListProduct {
  id: string;
  name: string;
  image?: {
    url: string;
    alt: string;
  };
  category: {
    id: string;
    igrp: number;
    displayName: string;
    sourceName: string;
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
  };
}

export interface BuildListItem extends BuildListProduct {
  quantity: number;
  addedAt: string;
  updatedAt: string;
}

export interface BuildListSummary {
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
}

interface BuildListProductInput extends Omit<BuildListProduct, "image"> {
  image?: BuildListProduct["image"] | null;
}

export function toBuildListProduct(product: BuildListProductInput): BuildListProduct {
  const image =
    normalizeBuildListImage(product.image, product.name) ??
    createBuildListProductImage(product.id, product.name);

  return {
    id: product.id,
    name: product.name,
    image,
    category: product.category,
    price: product.price,
    source: product.source,
  };
}

export function addProductToBuildList(
  items: BuildListItem[],
  product: BuildListProduct,
  now = new Date(),
): BuildListItem[] {
  const existingItem = items.find((item) => item.id === product.id);
  const updatedAt = now.toISOString();

  if (!existingItem) {
    return [
      ...items,
      {
        ...product,
        quantity: 1,
        addedAt: updatedAt,
        updatedAt,
      },
    ];
  }

  return items.map((item) =>
    item.id === product.id
      ? {
          ...item,
          ...product,
          quantity: clampBuildListQuantity(item.quantity + 1),
          addedAt: item.addedAt,
          updatedAt,
        }
      : item,
  );
}

export function updateBuildListItemQuantity(
  items: BuildListItem[],
  productId: string,
  quantity: number,
  now = new Date(),
): BuildListItem[] {
  const normalizedQuantity = clampBuildListQuantity(quantity);
  const updatedAt = now.toISOString();

  return items.map((item) =>
    item.id === productId
      ? {
          ...item,
          quantity: normalizedQuantity,
          updatedAt,
        }
      : item,
  );
}

export function removeBuildListItem(items: BuildListItem[], productId: string): BuildListItem[] {
  return items.filter((item) => item.id !== productId);
}

export function restoreBuildListItem(
  items: BuildListItem[],
  restoredItem: BuildListItem,
): BuildListItem[] {
  const hasItem = items.some((item) => item.id === restoredItem.id);

  if (!hasItem) {
    return [...items, restoredItem];
  }

  return items.map((item) => (item.id === restoredItem.id ? restoredItem : item));
}

export function summarizeBuildList(items: BuildListItem[]): BuildListSummary {
  return items.reduce(
    (summary, item) => ({
      itemCount: summary.itemCount + 1,
      totalQuantity: summary.totalQuantity + item.quantity,
      totalAmount: summary.totalAmount + getBuildListLineSubtotal(item),
    }),
    {
      itemCount: 0,
      totalQuantity: 0,
      totalAmount: 0,
    },
  );
}

export function getBuildListLineSubtotal(item: Pick<BuildListItem, "price" | "quantity">) {
  return item.price.amount * item.quantity;
}

export function normalizeBuildListItems(value: unknown): BuildListItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const itemsById = new Map<string, BuildListItem>();

  for (const candidate of value) {
    const item = normalizeBuildListItem(candidate);

    if (!item) {
      continue;
    }

    itemsById.set(item.id, item);
  }

  return [...itemsById.values()];
}

export function clampBuildListQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(quantity), 1), BUILD_LIST_MAX_QUANTITY);
}

function normalizeBuildListItem(value: unknown): BuildListItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const product = normalizeBuildListProduct(value);

  if (!product) {
    return null;
  }

  const addedAt = normalizeIsoDate(value.addedAt);
  const updatedAt = normalizeIsoDate(value.updatedAt);

  return {
    ...product,
    quantity: clampBuildListQuantity(toNumber(value.quantity)),
    addedAt: addedAt ?? new Date(0).toISOString(),
    updatedAt: updatedAt ?? addedAt ?? new Date(0).toISOString(),
  };
}

function normalizeBuildListProduct(value: Record<string, unknown>): BuildListProduct | null {
  if (!isRecord(value.category) || !isRecord(value.price) || !isRecord(value.source)) {
    return null;
  }

  const id = toNonEmptyString(value.id);
  const name = toNonEmptyString(value.name);
  const categoryId = toNonEmptyString(value.category.id);
  const categoryDisplayName = toNonEmptyString(value.category.displayName);
  const categorySourceName = toNonEmptyString(value.category.sourceName);
  const categoryIgrp = toNumber(value.category.igrp);
  const priceAmount = toNumber(value.price.amount);
  const priceCurrency = value.price.currency;
  const priceCapturedAt = normalizeIsoDate(value.price.capturedAt);
  const priceLastSeenAt = normalizeIsoDate(value.price.lastSeenAt);
  const sourceName = value.source.name;
  const sourceUrl = toHttpUrl(value.source.url);
  const storedImage = normalizeBuildListImage(
    value.image,
    name ?? categoryDisplayName ?? "商品圖片",
  );

  if (
    !id ||
    !name ||
    !categoryId ||
    !categoryDisplayName ||
    !categorySourceName ||
    !Number.isInteger(categoryIgrp) ||
    !Number.isFinite(priceAmount) ||
    priceAmount < 0 ||
    priceCurrency !== "TWD" ||
    !priceCapturedAt ||
    !priceLastSeenAt ||
    sourceName !== "coolpc" ||
    !sourceUrl
  ) {
    return null;
  }

  return {
    id,
    name,
    image: storedImage ?? createBuildListProductImage(id, name),
    category: {
      id: categoryId,
      igrp: categoryIgrp,
      displayName: categoryDisplayName,
      sourceName: categorySourceName,
    },
    price: {
      amount: Math.trunc(priceAmount),
      currency: "TWD",
      capturedAt: priceCapturedAt,
      lastSeenAt: priceLastSeenAt,
    },
    source: {
      name: "coolpc",
      url: sourceUrl,
    },
  };
}

function createBuildListProductImage(productId: string, alt: string) {
  return {
    url: `/api/product-images/${encodeURIComponent(productId)}.webp`,
    alt,
  };
}

function normalizeBuildListImage(value: unknown, fallbackAlt: string) {
  if (!isRecord(value)) {
    return null;
  }

  const url = toImageUrl(value.url);

  if (!url) {
    return null;
  }

  return {
    url,
    alt: typeof value.alt === "string" && value.alt.trim() ? value.alt.trim() : fallbackAlt,
  };
}
