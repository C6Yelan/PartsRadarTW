// apps/web/tests/build-list/storage.test.ts
import { describe, expect, it } from "vitest";

import type { BuildListItem } from "../../app/build-list/model";
import {
  BUILD_LIST_STORAGE_KEY,
  readBuildListItems,
  type BuildListStorage,
  writeBuildListItems,
} from "../../app/build-list/storage";

describe("build list storage", () => {
  it("reads normalized items and ignores malformed JSON", () => {
    const storage = fakeStorage();
    storage.setItem(BUILD_LIST_STORAGE_KEY, JSON.stringify([item()]));

    expect(readBuildListItems(storage)).toHaveLength(1);

    storage.setItem(BUILD_LIST_STORAGE_KEY, "{");

    expect(readBuildListItems(storage)).toEqual([]);
  });

  it("writes non-empty lists and removes empty lists", () => {
    const storage = fakeStorage();

    expect(writeBuildListItems([item()], storage)).toHaveLength(1);
    expect(storage.getItem(BUILD_LIST_STORAGE_KEY)).toContain("GPU RTX 4070");

    expect(writeBuildListItems([], storage)).toEqual([]);
    expect(storage.getItem(BUILD_LIST_STORAGE_KEY)).toBeNull();
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

function item(): BuildListItem {
  return {
    id: "product-1",
    name: "GPU RTX 4070",
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
    quantity: 1,
    addedAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  };
}
