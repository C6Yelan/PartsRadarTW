// apps/crawler/src/coolpc/raw-snapshot-cleanup/files.ts
// 處理 raw snapshot 壓縮檔清理流程中的路徑驗證、預檢與刪除執行，確保只操作 storage 內的檔案且不會越權刪除。

import { lstat, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export function validateCompressedHtmlPaths(
  storageDir: string,
  compressedHtmlPaths: string[],
): void {
  // 將所有輸入路徑先統一解析，過濾空字串、絕對路徑、越界、根目錄等危險路徑。
  for (const relativePath of compressedHtmlPaths) {
    resolveCompressedHtmlPath(storageDir, relativePath);
  }
}

export async function preflightCompressedHtmlFiles(
  storageDir: string,
  compressedHtmlPaths: string[],
): Promise<void> {
  // 刪除前預檢：檔案不存在可忽略，非檔案類型直接阻擋，避免刪到目錄或特殊檔。
  for (const relativePath of compressedHtmlPaths) {
    const outputPath = resolveCompressedHtmlPath(storageDir, relativePath);

    try {
      const stats = await lstat(outputPath);

      if (!stats.isFile()) {
        throw new Error(
          `Refusing to delete raw snapshot path because it is not a regular file: ${relativePath}`,
        );
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }
}

export async function deleteCompressedHtmlFiles(
  storageDir: string,
  compressedHtmlPaths: string[],
): Promise<{ deleted: number; missing: number }> {
  // 逐筆刪除，逐檔統計 deleted / missing，僅把 ENOENT 視為缺失可接受其他錯誤向外拋。
  let deleted = 0;
  let missing = 0;

  for (const relativePath of compressedHtmlPaths) {
    try {
      await unlink(resolveCompressedHtmlPath(storageDir, relativePath));
      deleted += 1;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        missing += 1;
        continue;
      }

      throw error;
    }
  }

  return { deleted, missing };
}

function resolveCompressedHtmlPath(storageDir: string, relativePath: string): string {
  // 將 relativePath 轉為 storageDir 下的實體路徑並做目錄越界防護，
  // 避免接受空字串、絕對路徑、storage root 本身或超出目錄邊界的輸入。
  if (!relativePath) {
    throw new Error("Raw snapshot compressed_html_path must not be empty.");
  }

  if (isAbsolute(relativePath)) {
    throw new Error(`Refusing to delete absolute raw snapshot path: ${relativePath}`);
  }

  const root = resolve(storageDir);
  const outputPath = resolve(root, relativePath);
  const relativeOutputPath = relative(root, outputPath);

  if (relativeOutputPath === "") {
    throw new Error(`Refusing to delete raw snapshot storage root: ${relativePath}`);
  }

  if (relativeOutputPath.startsWith("..") || isAbsolute(relativeOutputPath)) {
    throw new Error(`Refusing to delete raw snapshot path outside storage dir: ${relativePath}`);
  }

  return outputPath;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  // Type guard：只要是帶有 code 的 Error，才判斷為 Node 檔案系統錯誤，方便 ENOENT 分流處理。
  return error instanceof Error && "code" in error;
}
