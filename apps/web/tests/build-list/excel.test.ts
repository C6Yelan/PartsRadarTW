// apps/web/tests/build-list/excel.test.ts
import { describe, expect, it } from "vitest";

import {
  buildBuildListWorkbook,
  createBuildListExcelFilename,
  createBuildListWorksheetRows,
} from "../../app/build-list/excel";
import type { BuildListItem } from "../../app/build-list/model";

describe("build list Excel export", () => {
  it("creates recognizable filenames", () => {
    expect(createBuildListExcelFilename(new Date(2026, 5, 3, 10, 15))).toBe(
      "PartsRadarTW-build-list-20260603-1015.xlsx",
    );
  });

  it("builds worksheet rows with product data, source URLs, subtotals, and totals", () => {
    expect(createBuildListWorksheetRows([item()])).toEqual([
      [
        "分類",
        "商品名稱",
        "數量",
        "目前價格",
        "小計",
        "價格更新時間",
        "原價屋查看 / 購買網址",
        "備註",
      ],
      [
        "顯示卡",
        "GPU RTX 4070",
        2,
        6990,
        13_980,
        "2026-05-28 19:55",
        "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
        "",
      ],
      ["總價", "", 2, "", 13_980, "", "", ""],
    ]);
  });

  it("writes a valid xlsx package with readable worksheet XML", () => {
    const workbook = buildBuildListWorkbook([item()]);
    const worksheetXml = extractStoredZipEntry(workbook, "xl/worksheets/sheet1.xml");
    const worksheetRelationshipsXml = extractStoredZipEntry(
      workbook,
      "xl/worksheets/_rels/sheet1.xml.rels",
    );

    expect(worksheetXml).toContain("分類");
    expect(worksheetXml).toContain("GPU RTX 4070");
    expect(worksheetXml).toContain("<c r=\"C2\"><v>2</v></c>");
    expect(worksheetXml).toContain("<c r=\"E2\"><v>13980</v></c>");
    expect(worksheetXml).toContain("2026-05-28 19:55");
    expect(worksheetXml).toContain("https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070");
    expect(worksheetXml).not.toContain("https://example.com/gpu");
    expect(worksheetXml).toContain('<hyperlink ref="G2" r:id="rId1"/>');
    expect(worksheetRelationshipsXml).toContain(
      'Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070" TargetMode="External"',
    );
    expect(worksheetXml).toContain("總價");
    expect(worksheetXml).toContain("<c r=\"E3\"><v>13980</v></c>");
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
