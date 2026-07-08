// apps/crawler/tests/coolpc/category-snapshot-support.ts
// 提供 category snapshot 測試共用的暫存目錄管理與 fixture 讀取 helper。

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtureDir = join(__dirname, "fixtures");

// 建立每個 category snapshot 測試檔共用的環境工具，統一管理 temp storage 與 fixture 載入。
export function createCategorySnapshotTestEnvironment() {
  const tempDirs: string[] = [];

  return {
    cleanup: async () => {
      await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
    },
    createStorageDir: async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "partsradar-category-snapshot-"));
      tempDirs.push(tempDir);
      return tempDir;
    },
    fixture: (name: string) => readFile(join(fixtureDir, name), "utf8"),
  };
}
