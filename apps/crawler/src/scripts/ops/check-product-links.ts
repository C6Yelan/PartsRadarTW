// apps/crawler/src/scripts/ops/check-product-links.ts
// 手動執行商品來源查看連結健康檢查，將結果寫入 product_link_health 供低干擾提示使用。
// 此工具只記錄連結狀態，不會移除商品或改變商品 active / missing 判斷。

import type { PrismaClient } from "@partsradar/db";
import { loadWorkspaceEnv, toSafeCliErrorMessage } from "../shared/script-utils";
import { parseOptions, printSummary } from "./product-link-checker/options";
import {
  checkProductLinks,
  readProductPurchaseLinkTargets,
  type ProductLinkHealthClient,
} from "./product-link-checker/processor";
import { createOpsLogger } from "./shared/logger";

const logger = createOpsLogger();

// 載入工作區 env 與 Prisma client，執行一次手動 link health 檢查並確保 DB 連線收尾。
async function main() {
  const options = parseOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;
    const linkHealthClient = toProductLinkHealthClient(client);

    const purchaseLinkTargets = await readProductPurchaseLinkTargets(linkHealthClient, options);
    const summary = await checkProductLinks(linkHealthClient, purchaseLinkTargets, options, {
      log: (message) => logger.info(message),
      debugLog: (message) => logger.debug(message),
    });

    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(toSafeCliErrorMessage(error));
  process.exitCode = 1;
});

// 將完整 Prisma client 收斂成 link health processor 需要的最小資料介面。
function toProductLinkHealthClient(client: PrismaClient): ProductLinkHealthClient {
  return {
    product: {
      findMany: (args) => client.product.findMany(args),
    },
    productLinkHealth: {
      upsert: (args) => client.productLinkHealth.upsert(args),
    },
  };
}
