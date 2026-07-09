// apps/web/app/build-list/model.ts
// 定義配單 localStorage snapshot 的資料模型，並提供新增、數量調整、移除、復原與正規化純函式。

import {
  isRecord,
  normalizeIsoDate,
  toHttpUrl,
  toImageUrl,
  toNonEmptyString,
  toNumber,
} from "./model/validation";

export const BUILD_LIST_MAX_QUANTITY = 99;

// 配單保存的商品快照；目前不是即時查詢結果，後續刷新流程會更新這份 snapshot。
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

// 配單單列品項，在商品快照外加上使用者選擇的數量與本機更新時間。
export interface BuildListItem extends BuildListProduct {
  quantity: number;
  addedAt: string;
  updatedAt: string;
}

// 配單摘要資料，供浮動入口、頁面標題與總計側欄共用。
export interface BuildListSummary {
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
}

interface BuildListProductInput extends Omit<BuildListProduct, "image"> {
  image?: BuildListProduct["image"] | null;
}

// 將商品列表 / 詳細頁資料轉成配單商品快照，缺圖時回退到本機圖片 API。
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

// 加入商品到配單；已存在時增加數量並刷新商品快照，保留首次加入時間。
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

// 更新單一配單品項數量，並將數量限制在配單允許範圍內。
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

// 從配單移除指定商品 id，供單筆移除與 decrease-to-zero 流程共用。
export function removeBuildListItem(items: BuildListItem[], productId: string): BuildListItem[] {
  return items.filter((item) => item.id !== productId);
}

// 還原被移除的品項；若品項已存在，使用復原 snapshot 覆蓋目前資料。
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

// 彙總配單品項數量與總金額，讓 UI 不需要重複計算摘要。
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

// 計算單一配單品項小計，供頁面列與 Excel 匯出共用。
export function getBuildListLineSubtotal(item: Pick<BuildListItem, "price" | "quantity">) {
  return item.price.amount * item.quantity;
}

// 正規化 persisted 配單資料，丟棄無效品項並以 product id 去重。
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

// 將使用者輸入或 persisted 數量限制在 1 到 BUILD_LIST_MAX_QUANTITY。
export function clampBuildListQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(quantity), 1), BUILD_LIST_MAX_QUANTITY);
}

// 正規化單一 persisted 配單品項，缺少時間時回退到 epoch 避免資料無法讀取。
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

// 正規化 persisted 商品快照，確保來源、價格、分類與連結仍符合配單模型。
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
  const purchaseUrl = toHttpUrl(value.source.url);
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
    !purchaseUrl
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
      url: purchaseUrl,
    },
  };
}

// 建立商品圖片 fallback URL，支援舊版配單資料或 detail API 尚未帶圖的商品。
function createBuildListProductImage(productId: string, alt: string) {
  return {
    url: `/api/product-images/${encodeURIComponent(productId)}.webp`,
    alt,
  };
}

// 正規化配單圖片資料；圖片 URL 無效時交由呼叫端改用本機圖片 API。
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
