// apps/web/app/build-list/xlsx-zip.ts
// 建立配單 Excel 匯出所需的最小 ZIP 封裝，只支援未壓縮的文字檔 entry。

interface StoredZipEntry {
  path: string;
  content: string;
}

// 將 XLSX 內部 XML 檔案包成 store-only ZIP；不作為通用壓縮工具使用。
export function createStoredZipArchive(entries: StoredZipEntry[]) {
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

// 建立 ZIP local file header，供 Excel 讀取每個未壓縮 XML entry。
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

// 建立 central directory header，讓 XLSX reader 能定位每個 entry 的 local header。
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

// 建立 ZIP 結尾紀錄，宣告 entry 數量與 central directory 位置。
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

// 合併各段 ZIP binary 結構，避免 Blob 之外的匯出流程再處理多個 buffer。
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

// 計算 ZIP entry 需要的 CRC32 checksum，確保 Excel 能驗證未壓縮內容。
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
