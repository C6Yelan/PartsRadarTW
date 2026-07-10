// apps/web/app/build-list/excel.ts
// 產生 refresh-backed 配單 Excel worksheet、最小 XLSX package 與台北時區檔名。

import { formatBuildListExportDateTime } from "./formatting";
import { type BuildListItem, getBuildListLineSubtotal, summarizeBuildListItems } from "./model";
import { createStoredZipArchive } from "./xlsx-zip";

export const BUILD_LIST_EXCEL_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type CellValue = number | string | null;

interface WorksheetHyperlink {
  cellRef: string;
  relationshipId: string;
  target: string;
}

export function createBuildListExcelFilename(now = new Date()) {
  const formattedDateTime = formatBuildListExportDateTime(now.toISOString());
  const timestamp = formattedDateTime.replaceAll("-", "").replace(" ", "-").replace(":", "");

  return `PartsRadarTW-build-list-${timestamp}.xlsx`;
}

export function buildBuildListWorkbook(
  items: BuildListItem[],
  lastSuccessfulSyncAt: string | null,
): Uint8Array {
  const worksheetRows = createBuildListWorksheetRows(items, lastSuccessfulSyncAt);
  const worksheetHyperlinks = createBuildListWorksheetHyperlinks(items);

  return createStoredZipArchive([
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="PartsRadarTW 配單" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      path: "xl/worksheets/sheet1.xml",
      content: buildWorksheetXml(worksheetRows, worksheetHyperlinks, items.length + 1),
    },
    ...(worksheetHyperlinks.length > 0
      ? [
          {
            path: "xl/worksheets/_rels/sheet1.xml.rels",
            content: buildWorksheetRelationshipsXml(worksheetHyperlinks),
          },
        ]
      : []),
  ]);
}

export function createBuildListWorksheetRows(
  items: BuildListItem[],
  lastSuccessfulSyncAt: string | null,
): CellValue[][] {
  const summary = summarizeBuildListItems(items);
  const syncTime = lastSuccessfulSyncAt ? formatBuildListExportDateTime(lastSuccessfulSyncAt) : "";

  return [
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
    ...items.map((item) => {
      const subtotal = getBuildListLineSubtotal(item);

      return [
        item.intent.productId,
        item.product?.category.displayName ?? "",
        item.product?.name ?? "",
        getBuildListExportStatus(item),
        item.intent.quantity,
        item.product?.price?.amount ?? "",
        subtotal ?? "",
        item.product ? formatBuildListExportDateTime(item.product.lastSeenAt) : "",
        syncTime,
        item.product?.source.url ?? "",
        "",
      ];
    }),
    ["總價", "", "", "", summary.totalQuantity, "", summary.totalAmount, "", "", "", ""],
  ];
}

function getBuildListExportStatus(item: BuildListItem): string {
  if (!item.product) {
    return "暫時無法確認";
  }

  return item.product.status.isActive ? "目前上架" : "可能已下架";
}

function createBuildListWorksheetHyperlinks(items: BuildListItem[]): WorksheetHyperlink[] {
  const links = items.flatMap((item, itemIndex) =>
    item.product
      ? [
          {
            cellRef: `J${itemIndex + 2}`,
            target: item.product.source.url,
          },
        ]
      : [],
  );

  return links.map((link, linkIndex) => ({
    ...link,
    relationshipId: `rId${linkIndex + 1}`,
  }));
}

function buildWorksheetXml(
  rows: CellValue[][],
  hyperlinks: WorksheetHyperlink[],
  lastProductRowIndex: number,
) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const lastCellRef = `${toColumnName(columnCount)}${rows.length}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastCellRef}"/>
  <sheetViews>
    <sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="38" customWidth="1"/>
    <col min="2" max="2" width="16" customWidth="1"/>
    <col min="3" max="3" width="48" customWidth="1"/>
    <col min="4" max="4" width="18" customWidth="1"/>
    <col min="5" max="7" width="12" customWidth="1"/>
    <col min="8" max="9" width="24" customWidth="1"/>
    <col min="10" max="10" width="56" customWidth="1"/>
    <col min="11" max="11" width="20" customWidth="1"/>
  </cols>
  <sheetData>
${rows.map((row, index) => buildRowXml(row, index + 1)).join("\n")}
  </sheetData>
  <autoFilter ref="A1:K${lastProductRowIndex}"/>
${buildWorksheetHyperlinksXml(hyperlinks)}
</worksheet>`;
}

function buildWorksheetHyperlinksXml(hyperlinks: WorksheetHyperlink[]) {
  if (hyperlinks.length === 0) {
    return "";
  }

  return `  <hyperlinks>
${hyperlinks
  .map(
    (hyperlink) =>
      `    <hyperlink ref="${escapeXml(hyperlink.cellRef)}" r:id="${escapeXml(
        hyperlink.relationshipId,
      )}"/>`,
  )
  .join("\n")}
  </hyperlinks>`;
}

function buildWorksheetRelationshipsXml(hyperlinks: WorksheetHyperlink[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hyperlinks
  .map(
    (hyperlink) =>
      `  <Relationship Id="${escapeXml(
        hyperlink.relationshipId,
      )}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(
        hyperlink.target,
      )}" TargetMode="External"/>`,
  )
  .join("\n")}
</Relationships>`;
}

function buildRowXml(row: CellValue[], rowIndex: number) {
  const cells = row
    .map((cell, columnIndex) => buildCellXml(cell, `${toColumnName(columnIndex + 1)}${rowIndex}`))
    .join("");

  return `    <row r="${rowIndex}">${cells}</row>`;
}

function buildCellXml(value: CellValue, cellRef: string) {
  if (value === null || value === "") {
    return `<c r="${cellRef}"/>`;
  }

  if (typeof value === "number") {
    return `<c r="${cellRef}"><v>${value}</v></c>`;
  }

  return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function toColumnName(index: number) {
  let columnName = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    current = Math.floor((current - 1) / 26);
  }

  return columnName;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
