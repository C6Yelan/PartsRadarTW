// apps/web/app/build-list/download.ts
import {
  BUILD_LIST_EXCEL_MIME_TYPE,
  buildBuildListWorkbook,
  createBuildListExcelFilename,
} from "./excel";
import type { BuildListItem } from "./model";

export interface BuildListExcelDownload {
  blob: Blob;
  filename: string;
}

export function createBuildListExcelDownload(
  items: BuildListItem[],
  now = new Date(),
): BuildListExcelDownload {
  const workbookBytes = buildBuildListWorkbook(items);
  const workbookBuffer = new ArrayBuffer(workbookBytes.byteLength);
  new Uint8Array(workbookBuffer).set(workbookBytes);

  return {
    blob: new Blob([workbookBuffer], {
      type: BUILD_LIST_EXCEL_MIME_TYPE,
    }),
    filename: createBuildListExcelFilename(now),
  };
}

export function downloadBuildListExcel(items: BuildListItem[]) {
  const { blob, filename } = createBuildListExcelDownload(items);
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = filename;
  downloadLink.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
}
