import {
  getBuildListLineSubtotal,
  summarizeBuildList,
  type BuildListItem,
} from "./model";

export const BUILD_LIST_EXCEL_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type CellValue = number | string | null;

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
  return createZipArchive([
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
      content: buildWorksheetXml(createBuildListWorksheetRows(items)),
    },
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
      formatExportDateTime(item.price.lastSeenAt),
      item.source.url,
      item.introductionUrl ?? "",
      "",
    ]),
    ["總價", "", summary.totalQuantity, "", summary.totalAmount, "", "", "", ""],
  ];
}

function buildWorksheetXml(rows: CellValue[][]) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const lastCellRef = `${toColumnName(columnCount)}${rows.length}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
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
</worksheet>`;
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

function createZipArchive(entries: { path: string; content: string }[]) {
  const encoder = new TextEncoder();
  const fileRecords = entries.map((entry) => ({
    path: encoder.encode(entry.path),
    content: encoder.encode(entry.content),
  }));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of fileRecords) {
    const crc = crc32(file.content);
    const localHeader = createLocalFileHeader(file.path, file.content, crc);
    localParts.push(localHeader, file.content);
    centralParts.push(createCentralDirectoryHeader(file.path, file.content, crc, localOffset));
    localOffset += localHeader.byteLength + file.content.byteLength;
  }

  const centralDirectoryOffset = localOffset;
  const centralDirectorySize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const endRecord = createEndOfCentralDirectoryRecord(
    fileRecords.length,
    centralDirectorySize,
    centralDirectoryOffset,
  );

  return concatUint8Arrays([...localParts, ...centralParts, endRecord]);
}

function createLocalFileHeader(path: Uint8Array, content: Uint8Array, crc: number) {
  const header = new Uint8Array(30 + path.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, content.byteLength, true);
  view.setUint32(22, content.byteLength, true);
  view.setUint16(26, path.byteLength, true);
  view.setUint16(28, 0, true);
  header.set(path, 30);

  return header;
}

function createCentralDirectoryHeader(
  path: Uint8Array,
  content: Uint8Array,
  crc: number,
  localOffset: number,
) {
  const header = new Uint8Array(46 + path.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, content.byteLength, true);
  view.setUint32(24, content.byteLength, true);
  view.setUint16(28, path.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  header.set(path, 46);

  return header;
}

function createEndOfCentralDirectoryRecord(
  fileCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

function formatExportDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const taipeiDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);

  return `${taipeiDate.getUTCFullYear()}-${pad2(taipeiDate.getUTCMonth() + 1)}-${pad2(
    taipeiDate.getUTCDate(),
  )} ${pad2(taipeiDate.getUTCHours())}:${pad2(taipeiDate.getUTCMinutes())} UTC+8`;
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
