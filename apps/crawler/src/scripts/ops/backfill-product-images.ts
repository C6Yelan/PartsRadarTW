// apps/crawler/src/scripts/ops/backfill-product-images.ts
// 手動執行商品圖片快取補圖，串接候選查詢、低頻來源請求與 WebP 縮圖寫入。
// 此檔是 ops CLI entrypoint，不是 scheduled crawler 的常態補圖流程。

import type { PrismaClient } from "@partsradar/db";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { parseOptions, printSummary } from "./image-cache-backfill/options";
import { backfillImages, readCandidates } from "./image-cache-backfill/processor";
import { createOpsLogger } from "./shared/logger";

const logger = createOpsLogger();

// 載入工作區 env 與 Prisma client，執行一次手動圖片補圖並確保 DB 連線收尾。
async function main() {
  const args = process.argv.slice(2);

  if (!args.includes("--help")) {
    await loadWorkspaceEnv(resolveWorkspaceRoot());
  }

  const options = parseOptions(args);
  let client: PrismaClient | null = null;

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    const candidates = await readCandidates(client, options);
    const summary = await backfillImages(candidates, options, {
      log: (message) => logger.info(message),
      debugLog: (message) => logger.debug(message),
    });

    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

main().catch((error) => {
  console.error(toSafeCliErrorMessage(error));
  process.exitCode = 1;
});
