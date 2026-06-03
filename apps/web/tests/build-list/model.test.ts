// apps/web/tests/build-list/model.test.ts
import { describe, expect, it } from "vitest";

import {
  addProductToBuildList,
  clampBuildListQuantity,
  getBuildListLineSubtotal,
  normalizeBuildListItems,
  removeBuildListItem,
  restoreBuildListItem,
  summarizeBuildList,
  toBuildListProduct,
  updateBuildListItemQuantity,
  type BuildListItem,
  type BuildListProduct,
} from "../../app/build-list/model";

describe("build list model", () => {
  it("adds products, increments existing quantities, and refreshes product snapshots", () => {
    const first = addProductToBuildList([], product(), new Date("2026-06-03T10:00:00.000Z"));
    const second = addProductToBuildList(
      first,
      product({ price: { ...product().price, amount: 6500 } }),
      new Date("2026-06-03T10:05:00.000Z"),
    );

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      id: "product-1",
      quantity: 2,
      price: {
        amount: 6500,
      },
      addedAt: "2026-06-03T10:00:00.000Z",
      updatedAt: "2026-06-03T10:05:00.000Z",
    });
  });

  it("updates quantity, removes items, and summarizes totals", () => {
    const items = [
      item({ id: "product-1", price: { ...product().price, amount: 7000 }, quantity: 2 }),
      item({ id: "product-2", price: { ...product().price, amount: 3000 }, quantity: 1 }),
    ];
    const updatedItems = updateBuildListItemQuantity(
      items,
      "product-2",
      3,
      new Date("2026-06-03T10:10:00.000Z"),
    );

    expect(updatedItems.find((candidate) => candidate.id === "product-2")).toMatchObject({
      quantity: 3,
      updatedAt: "2026-06-03T10:10:00.000Z",
    });
    expect(getBuildListLineSubtotal(updatedItems[1])).toBe(9000);
    expect(summarizeBuildList(updatedItems)).toEqual({
      itemCount: 2,
      totalQuantity: 5,
      totalAmount: 23_000,
    });
    expect(removeBuildListItem(updatedItems, "product-1")).toHaveLength(1);
  });

  it("restores a removed item without creating duplicates", () => {
    const removedItem = item({ quantity: 4 });
    const existingItem = item({ id: "product-2", quantity: 1 });

    expect(restoreBuildListItem([existingItem], removedItem)).toEqual([existingItem, removedItem]);
    expect(restoreBuildListItem([item({ quantity: 1 })], removedItem)).toEqual([removedItem]);
  });

  it("normalizes persisted localStorage data and drops invalid entries", () => {
    const normalizedItems = normalizeBuildListItems([
      item({ quantity: 120 }),
      item({ id: "product-2", introductionUrl: "javascript:alert(1)" }),
      { id: "broken" },
    ]);

    expect(normalizedItems).toHaveLength(1);
    expect(normalizedItems[0].quantity).toBe(99);
    expect(clampBuildListQuantity(Number.NaN)).toBe(1);
  });

  it("converts list and detail products into build list snapshots", () => {
    expect(
      toBuildListProduct({
        ...product(),
        image: {
          url: "/api/product-images/product-1.webp",
          alt: "GPU image",
        },
        introduction: {
          url: "https://example.com/gpu",
        },
      }),
    ).toMatchObject({
      id: "product-1",
      image: {
        url: "/api/product-images/product-1.webp",
        alt: "GPU image",
      },
      introductionUrl: "https://example.com/gpu",
    });
  });

  it("backfills legacy persisted items with product image URLs", () => {
    const { image: _image, ...legacyItem } = item();
    const normalizedItems = normalizeBuildListItems([legacyItem]);

    expect(normalizedItems).toHaveLength(1);
    expect(normalizedItems[0].image).toEqual({
      url: "/api/product-images/product-1.webp",
      alt: "GPU RTX 4070",
    });
  });
});

function product(overrides: Partial<BuildListProduct> = {}): BuildListProduct {
  return {
    id: "product-1",
    name: "GPU RTX 4070",
    image: {
      url: "/api/product-images/product-1.webp",
      alt: "GPU RTX 4070",
    },
    category: {
      id: "category-12",
      igrp: 12,
      displayName: "顯示卡",
      sourceName: "顯示卡 VGA",
    },
    price: {
      amount: 6990,
      currency: "TWD",
      capturedAt: "2026-05-28T11:45:00.000Z",
      lastSeenAt: "2026-05-28T11:55:00.000Z",
    },
    source: {
      name: "coolpc",
      url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
    },
    introductionUrl: "https://example.com/gpu",
    ...overrides,
  };
}

function item(overrides: Partial<BuildListItem> = {}): BuildListItem {
  return {
    ...product(overrides),
    quantity: 1,
    addedAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
    ...overrides,
  };
}
