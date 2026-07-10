// apps/web/app/build-list/download.ts
// 封裝配單 Excel 匯出的 Blob 建立與瀏覽器下載觸發。

import {
  BUILD_LIST_EXCEL_MIME_TYPE,
  buildBuildListWorkbook,
  createBuildListExcelFilename,
} from "./excel";
import type { BuildListItem } from "./model";

// 配單 Excel 下載資料，將可測的 Blob / filename 與 DOM 下載觸發分開。
export interface BuildListExcelDownload {
  blob: Blob;
  filename: string;
}

// 建立配單 Excel 下載內容，供瀏覽器下載流程與單元測試共用。
export function createBuildListExcelDownload(
  items: BuildListItem[],
  lastSuccessfulSyncAt: string | null,
  now = new Date(),
): BuildListExcelDownload {
  const workbookBytes = buildBuildListWorkbook(items, lastSuccessfulSyncAt);
  const workbookBuffer = new ArrayBuffer(workbookBytes.byteLength);
  new Uint8Array(workbookBuffer).set(workbookBytes);

  return {
    blob: new Blob([workbookBuffer], {
      type: BUILD_LIST_EXCEL_MIME_TYPE,
    }),
    filename: createBuildListExcelFilename(now),
  };
}

// 觸發瀏覽器下載配單 Excel，並在 click 後釋放暫時的 object URL。
export function downloadBuildListExcel(
  items: BuildListItem[],
  lastSuccessfulSyncAt: string | null,
) {
  const { blob, filename } = createBuildListExcelDownload(items, lastSuccessfulSyncAt);
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = filename;
  downloadLink.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
}
