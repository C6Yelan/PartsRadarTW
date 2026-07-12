// apps/web/tests/build-list/export.test.ts
// 驗證 refresh-backed Excel rows、Taipei 時區、freeze/filter、minimal XLSX 與下載 Blob。

import { describe, expect, it } from "vitest";

import { createBuildListExcelDownload } from "../../app/build-list/download";
import {
  BUILD_LIST_EXCEL_MIME_TYPE,
  buildBuildListWorkbook,
  createBuildListExcelFilename,
  createBuildListWorksheetRows,
  formatBuildListExportDateTime,
} from "../../app/build-list/excel";
import type {
  BuildListIntent,
  BuildListItem,
  BuildListProductSnapshot,
} from "../../app/build-list/model";

const PRODUCT_ID_1 = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID_2 = "22222222-2222-2222-2222-222222222222";
const PRODUCT_ID_3 = "33333333-3333-3333-3333-333333333333";
const SYNCED_AT = "2026-05-28T12:05:00.000Z";

describe("build list Excel export", () => {
  it("creates filenames using Asia/Taipei even when the UTC date differs", () => {
    expect(createBuildListExcelFilename(new Date("2026-05-28T16:05:00.000Z"))).toBe(
      "PartsRadarTW-build-list-20260529-0005.xlsx",
    );
  });

  it("keeps unknown rows and totals only priced active or inactive products", () => {
    expect(createBuildListWorksheetRows(items(), SYNCED_AT)).toEqual([
      [
        "商品 ID",
        "分類",
        "商品名稱",
        "商品狀態",
        "數量",
        "目前價格",
        "小計",
        "資料更新時間（Asia/Taipei）",
        "配單同步時間（Asia/Taipei）",
        "原價屋查看 / 購買網址",
        "備註",
      ],
      [
        PRODUCT_ID_1,
        "顯示卡",
        "GPU RTX 4070",
        "目前上架",
        2,
        6990,
        13_980,
        "2026-05-28 19:55",
        "2026-05-28 20:05",
        "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
        "",
      ],
      [
        PRODUCT_ID_2,
        "顯示卡",
        "GPU RTX 4060",
        "可能已下架",
        1,
        3000,
        3000,
        "2026-05-28 19:55",
        "2026-05-28 20:05",
        "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4060",
        "",
      ],
      [PRODUCT_ID_3, "", "", "暫時無法確認", 3, "", "", "", "2026-05-28 20:05", "", ""],
      ["總價", "", "", "", 6, "", 16_980, "", "", "", ""],
    ]);
  });

  it("writes frozen filtered worksheet XML without a styles system or missing-row hyperlink", () => {
    const workbook = buildBuildListWorkbook(items(), SYNCED_AT);
    const worksheetXml = extractStoredZipEntry(workbook, "xl/worksheets/sheet1.xml");
    const worksheetRelationshipsXml = extractStoredZipEntry(
      workbook,
      "xl/worksheets/_rels/sheet1.xml.rels",
    );
    const paths = listStoredZipEntries(workbook);

    expect(worksheetXml).toContain("GPU RTX 4070");
    expect(worksheetXml).toContain("暫時無法確認");
    expect(worksheetXml).toContain('<pane ySplit="1" topLeftCell="A2"');
    expect(worksheetXml).toContain('<autoFilter ref="A1:K4"/>');
    expect(worksheetXml).toContain('<hyperlink ref="J2" r:id="rId1"/>');
    expect(worksheetXml).toContain('<hyperlink ref="J3" r:id="rId2"/>');
    expect(worksheetXml).not.toContain('<hyperlink ref="J4"');
    expect(worksheetXml).not.toContain("<mergeCells");
    expect(worksheetRelationshipsXml).toContain("GPU-RTX-4070");
    expect(worksheetRelationshipsXml).toContain("GPU-RTX-4060");
    expect(paths).not.toContain("xl/styles.xml");
  });

  it("creates a downloadable Excel blob and Taipei filename", async () => {
    const download = createBuildListExcelDownload(
      items(),
      SYNCED_AT,
      new Date("2026-05-28T16:05:00.000Z"),
    );

    expect(download.filename).toBe("PartsRadarTW-build-list-20260529-0005.xlsx");
    expect(download.blob.type).toBe(BUILD_LIST_EXCEL_MIME_TYPE);
    expect(download.blob.size).toBeGreaterThan(0);
    await expect(download.blob.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it("exports only items selected for the downloaded build list", () => {
    const selectedItems = items().filter((item) => item.intent.includeInExport);
    const rows = createBuildListWorksheetRows(selectedItems, SYNCED_AT);

    expect(rows).toHaveLength(4);
    expect(rows.flat()).not.toContain("GPU RTX 4060");
    expect(rows.at(-1)).toEqual(["總價", "", "", "", 5, "", 13_980, "", "", "", ""]);
  });
});

describe("build list export formatting", () => {
  it("formats midnight in Asia/Taipei without a 24-hour rollover", () => {
    expect(formatBuildListExportDateTime("2026-05-28T16:05:00.000Z")).toBe("2026-05-29 00:05");
  });

  it("keeps invalid export date values readable", () => {
    expect(formatBuildListExportDateTime("not-a-date")).toBe("not-a-date");
  });
});

function items(): BuildListItem[] {
  return [
    item(PRODUCT_ID_1, snapshot(PRODUCT_ID_1), { quantity: 2, order: 0 }),
    item(
      PRODUCT_ID_2,
      snapshot(PRODUCT_ID_2, {
        name: "GPU RTX 4060",
        price: { amount: 3000, currency: "TWD" },
        source: {
          url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4060",
        },
        status: { isActive: false },
      }),
      { order: 1, includeInExport: false },
    ),
    item(PRODUCT_ID_3, null, { quantity: 3, order: 2 }, "missing"),
  ];
}

function item(
  productId: string,
  product: BuildListProductSnapshot | null,
  intentOverrides: Partial<BuildListIntent> = {},
  availability: BuildListItem["availability"] = "available",
): BuildListItem {
  return {
    intent: {
      productId,
      quantity: 1,
      includeInExport: true,
      order: 0,
      addedAt: "2026-06-03T10:00:00.000Z",
      updatedAt: "2026-06-03T10:00:00.000Z",
      ...intentOverrides,
    },
    product,
    availability,
  };
}

function snapshot(
  id: string,
  overrides: Partial<BuildListProductSnapshot> = {},
): BuildListProductSnapshot {
  return {
    id,
    name: "GPU RTX 4070",
    image: null,
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

function extractStoredZipEntry(zip: Uint8Array, expectedPath: string) {
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset < zip.byteLength) {
    const view = new DataView(zip.buffer, zip.byteOffset + offset);
    const signature = view.getUint32(0, true);

    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const pathLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const pathStart = offset + 30;
    const pathEnd = pathStart + pathLength;
    const dataStart = pathEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const path = decoder.decode(zip.slice(pathStart, pathEnd));

    if (path === expectedPath) {
      expect(compressionMethod).toBe(0);
      return decoder.decode(zip.slice(dataStart, dataEnd));
    }

    offset = dataEnd;
  }

  throw new Error(`Missing zip entry: ${expectedPath}`);
}

function listStoredZipEntries(zip: Uint8Array): string[] {
  const decoder = new TextDecoder();
  const paths: string[] = [];
  let offset = 0;

  while (offset < zip.byteLength) {
    const view = new DataView(zip.buffer, zip.byteOffset + offset);

    if (view.getUint32(0, true) !== 0x04034b50) {
      break;
    }

    const compressedSize = view.getUint32(18, true);
    const pathLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const pathStart = offset + 30;
    const pathEnd = pathStart + pathLength;
    const dataStart = pathEnd + extraLength;
    paths.push(decoder.decode(zip.slice(pathStart, pathEnd)));
    offset = dataStart + compressedSize;
  }

  return paths;
}
