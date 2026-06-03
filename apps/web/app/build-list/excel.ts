// apps/web/app/build-list/excel.ts
import {
  getBuildListLineSubtotal,
  summarizeBuildList,
  type BuildListItem,
} from "./model";
import { formatBuildListExportDateTime } from "./formatting";
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
  const timestamp = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    "-",
    pad2(now.getHours()),
    pad2(now.getMinutes()),
  ].join("");

  return `PartsRadarTW-build-list-${timestamp}.xlsx`;
}

export function buildBuildListWorkbook(items: BuildListItem[]): Uint8Array {
  const worksheetRows = createBuildListWorksheetRows(items);
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
      content: buildWorksheetXml(worksheetRows, worksheetHyperlinks),
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

export function createBuildListWorksheetRows(items: BuildListItem[]): CellValue[][] {
  const summary = summarizeBuildList(items);

  return [
    [
      "分類",
      "商品名稱",
      "數量",
      "目前價格",
      "小計",
      "價格更新時間",
      "原價屋查看 / 購買網址",
      "產品介紹網址",
      "備註",
    ],
    ...items.map((item) => [
      item.category.displayName,
      item.name,
      item.quantity,
      item.price.amount,
      getBuildListLineSubtotal(item),
      formatBuildListExportDateTime(item.price.lastSeenAt),
      item.source.url,
      item.introductionUrl ?? "",
      "",
    ]),
    ["總價", "", summary.totalQuantity, "", summary.totalAmount, "", "", "", ""],
  ];
}

function createBuildListWorksheetHyperlinks(items: BuildListItem[]): WorksheetHyperlink[] {
  const links = items.flatMap((item, itemIndex) => {
    const rowIndex = itemIndex + 2;
    const itemLinks = [
      {
        cellRef: `G${rowIndex}`,
        target: item.source.url,
      },
    ];

    if (item.introductionUrl) {
      itemLinks.push({
        cellRef: `H${rowIndex}`,
        target: item.introductionUrl,
      });
    }

    return itemLinks;
  });

  return links.map((link, linkIndex) => ({
    ...link,
    relationshipId: `rId${linkIndex + 1}`,
  }));
}

function buildWorksheetXml(rows: CellValue[][], hyperlinks: WorksheetHyperlink[]) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const lastCellRef = `${toColumnName(columnCount)}${rows.length}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastCellRef}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="16" customWidth="1"/>
    <col min="2" max="2" width="48" customWidth="1"/>
    <col min="3" max="5" width="12" customWidth="1"/>
    <col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="8" width="56" customWidth="1"/>
    <col min="9" max="9" width="20" customWidth="1"/>
  </cols>
  <sheetData>
${rows.map((row, index) => buildRowXml(row, index + 1)).join("\n")}
  </sheetData>
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

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
