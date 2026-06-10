// apps/web/tests/build-list/download.test.ts
import { describe, expect, it } from "vitest";

import { BUILD_LIST_EXCEL_MIME_TYPE } from "../../app/build-list/excel";
import { createBuildListExcelDownload } from "../../app/build-list/download";
import type { BuildListItem } from "../../app/build-list/model";

describe("build list Excel download", () => {
  it("creates a downloadable Excel blob and filename", async () => {
    const download = createBuildListExcelDownload([item()], new Date(2026, 5, 3, 10, 15));

    expect(download.filename).toBe("PartsRadarTW-build-list-20260603-1015.xlsx");
    expect(download.blob.type).toBe(BUILD_LIST_EXCEL_MIME_TYPE);
    expect(download.blob.size).toBeGreaterThan(0);
    await expect(download.blob.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer);
  });
});

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
    quantity: 2,
    addedAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  };
}
