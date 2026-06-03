// apps/web/tests/build-list/coolpc-import.test.ts
import { describe, expect, it } from "vitest";

import {
  COOLPC_ESTIMATE_IMPORT_HASH_PREFIX,
  COOLPC_ESTIMATE_MAX_QUANTITY,
  createCoolpcEstimateImportPlan,
  extractCoolpcIbuyToken,
} from "../../app/build-list/coolpc-import";
import type { BuildListItem } from "../../app/build-list/model";

describe("CoolPC estimate import", () => {
  it("creates a CoolPC estimate URL with PartsRadar import payload", () => {
    const plan = createCoolpcEstimateImportPlan(
      [item({ igrp: 4, sourceUrl: "https://www.coolpc.com.tw/evaluate.php?iBuy=2" })],
      new Date("2026-06-03T12:00:00.000Z"),
    );

    expect(plan.canImport).toBe(true);
    expect(plan.importedItemCount).toBe(1);
    expect(plan.importUrl).toMatch(/^https:\/\/www\.coolpc\.com\.tw\/evaluate\.php\/#/);

    const hashPayload = decodeImportHash(plan.importUrl ?? "");

    expect(hashPayload).toEqual({
      source: "partsradar",
      v: 1,
      createdAt: "2026-06-03T12:00:00.000Z",
      items: [
        {
          g: 4,
          t: "2",
          q: 2,
          p: 6990,
        },
      ],
    });
  });

  it("skips duplicate CoolPC categories and clips quantities to the estimate page limit", () => {
    const plan = createCoolpcEstimateImportPlan([
      item({ igrp: 4, quantity: 12, sourceUrl: "https://www.coolpc.com.tw/evaluate.php?iBuy=2" }),
      item({
        id: "product-2",
        igrp: 4,
        sourceUrl: "https://www.coolpc.com.tw/evaluate.php?iBuy=3",
      }),
      item({
        id: "product-3",
        igrp: 5,
        sourceUrl: "https://example.com/evaluate.php?iBuy=4",
      }),
    ]);

    expect(plan.importedItemCount).toBe(1);
    expect(plan.payload.items[0].q).toBe(COOLPC_ESTIMATE_MAX_QUANTITY);
    expect(plan.duplicateCategoryItems).toHaveLength(1);
    expect(plan.unsupportedItems).toHaveLength(1);
    expect(plan.quantityClippedItems).toHaveLength(1);
  });

  it("extracts iBuy only from official CoolPC estimate URLs", () => {
    expect(extractCoolpcIbuyToken("https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070")).toBe(
      "GPU-RTX-4070",
    );
    expect(extractCoolpcIbuyToken("https://example.com/evaluate.php?iBuy=GPU-RTX-4070")).toBeNull();
    expect(extractCoolpcIbuyToken("not-a-url")).toBeNull();
  });
});

function decodeImportHash(importUrl: string) {
  const url = new URL(importUrl);
  const hash = url.hash.slice(1);

  expect(hash.startsWith(COOLPC_ESTIMATE_IMPORT_HASH_PREFIX)).toBe(true);

  return JSON.parse(
    decodeURIComponent(hash.slice(COOLPC_ESTIMATE_IMPORT_HASH_PREFIX.length)),
  ) as unknown;
}

function item({
  id = "product-1",
  igrp = 12,
  quantity = 2,
  sourceUrl = "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
}: {
  id?: string;
  igrp?: number;
  quantity?: number;
  sourceUrl?: string;
} = {}): BuildListItem {
  return {
    id,
    name: `Product ${id}`,
    category: {
      id: `category-${igrp}`,
      igrp,
      displayName: `IGrp ${igrp}`,
      sourceName: `IGrp ${igrp}`,
    },
    price: {
      amount: 6990,
      currency: "TWD",
      capturedAt: "2026-05-28T11:45:00.000Z",
      lastSeenAt: "2026-05-28T11:55:00.000Z",
    },
    source: {
      name: "coolpc",
      url: sourceUrl,
    },
    introductionUrl: null,
    quantity,
    addedAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  };
}
