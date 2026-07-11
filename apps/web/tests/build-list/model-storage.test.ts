// apps/web/tests/build-list/model-storage.test.ts
// 驗證配單 v2 intent 純函式、50 筆限制、refresh join 與 localStorage 邊界。

import { describe, expect, it } from "vitest";

import { MAX_BUILD_LIST_PRODUCTS } from "../../app/build-list/constants";
import {
  addProductToBuildList,
  type BuildListIntent,
  type BuildListProductSnapshot,
  clampBuildListQuantity,
  normalizeBuildListIntents,
  removeBuildListItem,
  resolveBuildListItems,
  restoreBuildListItem,
  summarizeBuildListIntents,
  summarizeBuildListItems,
  updateBuildListItemQuantity,
} from "../../app/build-list/model";
import {
  BUILD_LIST_STORAGE_KEY,
  type BuildListStorage,
  readBuildListIntents,
  writeBuildListIntents,
} from "../../app/build-list/storage";

const PRODUCT_ID_1 = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID_2 = "22222222-2222-2222-2222-222222222222";
const PRODUCT_ID_3 = "33333333-3333-3333-3333-333333333333";
const PRODUCT_ID_4 = "44444444-4444-4444-4444-444444444444";

describe("build list v2 model", () => {
  it("adds intent-only products and increments an existing quantity", () => {
    const first = addProductToBuildList([], PRODUCT_ID_1, new Date("2026-06-03T10:00:00Z"));
    const second = addProductToBuildList(
      first,
      PRODUCT_ID_1.toUpperCase(),
      new Date("2026-06-03T10:05:00Z"),
    );

    expect(second).toEqual([
      {
        productId: PRODUCT_ID_1,
        quantity: 2,
        order: 0,
        addedAt: "2026-06-03T10:00:00.000Z",
        updatedAt: "2026-06-03T10:05:00.000Z",
      },
    ]);
    expect(second[0]).not.toHaveProperty("name");
    expect(second[0]).not.toHaveProperty("price");
  });

  it("rejects a 51st product while still incrementing an existing product", () => {
    const fullList = Array.from({ length: MAX_BUILD_LIST_PRODUCTS }, (_, index) =>
      intent(productId(index), { order: index }),
    );

    expect(addProductToBuildList(fullList, PRODUCT_ID_1)).toBe(fullList);

    const incremented = addProductToBuildList(fullList, fullList[0].productId);

    expect(incremented).toHaveLength(MAX_BUILD_LIST_PRODUCTS);
    expect(incremented[0].quantity).toBe(2);
  });

  it("updates quantities, removes items, and restores explicit order", () => {
    const first = intent(PRODUCT_ID_1, { order: 0 });
    const removed = intent(PRODUCT_ID_2, { order: 1, quantity: 4 });
    const third = intent(PRODUCT_ID_3, { order: 2 });
    const withoutRemoved = removeBuildListItem([first, removed, third], PRODUCT_ID_2);
    const restored = restoreBuildListItem(withoutRemoved, removed);
    const updated = updateBuildListItemQuantity(
      restored,
      PRODUCT_ID_3,
      120,
      new Date("2026-06-03T10:10:00Z"),
    );

    expect(restored.map((candidate) => candidate.productId)).toEqual([
      PRODUCT_ID_1,
      PRODUCT_ID_2,
      PRODUCT_ID_3,
    ]);
    expect(updated[2]).toMatchObject({
      quantity: 99,
      updatedAt: "2026-06-03T10:10:00.000Z",
    });
    expect(clampBuildListQuantity(Number.NaN)).toBe(1);
  });

  it("restores a removed final item ahead of a newly added order collision", () => {
    const first = intent(PRODUCT_ID_1, { order: 0 });
    const second = intent(PRODUCT_ID_2, { order: 1 });
    const removedFinal = intent(PRODUCT_ID_3, { order: 2 });
    const withNewItem = addProductToBuildList(
      [first, second],
      PRODUCT_ID_4,
      new Date("2026-06-03T10:05:00Z"),
    );
    const restored = restoreBuildListItem(withNewItem, removedFinal);

    expect(restored.map(({ productId, order }) => ({ productId, order }))).toEqual([
      { productId: PRODUCT_ID_1, order: 0 },
      { productId: PRODUCT_ID_2, order: 1 },
      { productId: PRODUCT_ID_3, order: 2 },
      { productId: PRODUCT_ID_4, order: 3 },
    ]);
  });

  it("normalizes UUIDs and order while dropping v1 snapshots and invalid intents", () => {
    const normalized = normalizeBuildListIntents([
      intent(PRODUCT_ID_2, { order: 2, quantity: 120 }),
      intent(PRODUCT_ID_1.toUpperCase(), { order: 1 }),
      intent(PRODUCT_ID_1, { order: 3 }),
      { id: PRODUCT_ID_3, name: "legacy snapshot", quantity: 1 },
      { ...intent(PRODUCT_ID_4), addedAt: "invalid-date" },
    ]);

    expect(normalized.map((candidate) => candidate.productId)).toEqual([
      PRODUCT_ID_1,
      PRODUCT_ID_2,
    ]);
    expect(normalized[1].quantity).toBe(99);
  });

  it("joins snapshots by intent order and excludes unknown prices from totals", () => {
    const intents = [
      intent(PRODUCT_ID_1, { order: 0, quantity: 2 }),
      intent(PRODUCT_ID_2, { order: 1 }),
      intent(PRODUCT_ID_3, { order: 2 }),
      intent(PRODUCT_ID_4, { order: 3 }),
    ];
    const items = resolveBuildListItems(
      intents,
      [
        product(PRODUCT_ID_2, {
          price: { amount: 3000, currency: "TWD" },
          status: { isActive: false },
        }),
        product(PRODUCT_ID_4, { price: null }),
        product(PRODUCT_ID_1),
      ],
      "ready",
    );

    expect(items.map((item) => item.intent.productId)).toEqual([
      PRODUCT_ID_1,
      PRODUCT_ID_2,
      PRODUCT_ID_3,
      PRODUCT_ID_4,
    ]);
    expect(items[2]).toMatchObject({ product: null, availability: "missing" });
    expect(items[1].product?.status.isActive).toBe(false);
    expect(summarizeBuildListIntents(intents)).toEqual({
      itemCount: 4,
      totalQuantity: 5,
    });
    expect(summarizeBuildListItems(items)).toEqual({
      itemCount: 4,
      totalQuantity: 5,
      totalAmount: 16_980,
      unpricedItemCount: 2,
    });
  });

  it("marks all rows unavailable after a failed refresh without a last-known price", () => {
    const items = resolveBuildListItems([intent(PRODUCT_ID_1)], [], "error");

    expect(items).toEqual([
      {
        intent: intent(PRODUCT_ID_1),
        product: null,
        availability: "unavailable",
      },
    ]);
    expect(summarizeBuildListItems(items).totalAmount).toBe(0);
  });
});

describe("build list v2 storage", () => {
  it("reads only v2 intents and ignores the v1 snapshot key", () => {
    const storage = fakeStorage();
    storage.setItem(
      "partsradartw:build-list:v1",
      JSON.stringify([{ id: PRODUCT_ID_1, name: "legacy snapshot", quantity: 1 }]),
    );

    expect(readBuildListIntents(storage)).toEqual([]);

    storage.setItem(BUILD_LIST_STORAGE_KEY, JSON.stringify([intent(PRODUCT_ID_1)]));

    expect(readBuildListIntents(storage)).toEqual([intent(PRODUCT_ID_1)]);
  });

  it("writes only intent fields and removes an empty v2 list", () => {
    const storage = fakeStorage();

    expect(writeBuildListIntents([intent(PRODUCT_ID_1)], storage)).toHaveLength(1);
    expect(JSON.parse(storage.getItem(BUILD_LIST_STORAGE_KEY) ?? "null")).toEqual([
      intent(PRODUCT_ID_1),
    ]);
    expect(storage.getItem(BUILD_LIST_STORAGE_KEY)).not.toContain("name");
    expect(storage.getItem(BUILD_LIST_STORAGE_KEY)).not.toContain("price");

    expect(writeBuildListIntents([], storage)).toEqual([]);
    expect(storage.getItem(BUILD_LIST_STORAGE_KEY)).toBeNull();
  });

  it("returns an empty list for malformed v2 JSON", () => {
    const storage = fakeStorage();
    storage.setItem(BUILD_LIST_STORAGE_KEY, "{");

    expect(readBuildListIntents(storage)).toEqual([]);
  });
});

function fakeStorage(): BuildListStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function intent(productIdValue: string, overrides: Partial<BuildListIntent> = {}): BuildListIntent {
  return {
    productId: productIdValue,
    quantity: 1,
    order: 0,
    addedAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
    ...overrides,
  };
}

function product(
  id: string,
  overrides: Partial<BuildListProductSnapshot> = {},
): BuildListProductSnapshot {
  return {
    id,
    name: `Product ${id.slice(0, 8)}`,
    image: {
      url: `/api/product-images/${id}.webp`,
      alt: "Product image",
    },
    category: {
      displayName: "顯示卡",
    },
    price: {
      amount: 6990,
      currency: "TWD",
    },
    source: {
      url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
    },
    status: {
      isActive: true,
    },
    lastSeenAt: "2026-05-28T11:55:00.000Z",
    ...overrides,
  };
}

function productId(index: number): string {
  return `00000000-0000-0000-0000-${index.toString(16).padStart(12, "0")}`;
}
