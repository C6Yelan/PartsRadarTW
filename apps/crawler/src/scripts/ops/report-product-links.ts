// apps/crawler/src/scripts/ops/report-product-links.ts
// 輸出 product link health 的唯讀診斷報表；此功能線後續會隨連結健康檢查一起移除。

import type { PrismaClient } from "@partsradar/db";
import { loadWorkspaceEnv, toSafeCliErrorMessage } from "../shared/script-utils";
import {
  formatProductLinkHealthReport,
  parseProductLinkHealthReportOptions,
  readProductLinkHealthReport,
  type ProductLinkHealthReportClient,
} from "./product-link-health-report";

// 讀取 product link health rows 並輸出文字報表，不修改資料庫內容。
async function main() {
  const options = parseProductLinkHealthReportOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;
    const report = await readProductLinkHealthReport(toReportClient(client), options);

    console.log(formatProductLinkHealthReport(report));
  } finally {
    await client?.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(toSafeCliErrorMessage(error));
  process.exitCode = 1;
});

// 將 Prisma client 收斂成報表讀取需要的最小介面，方便測試替換。
function toReportClient(client: PrismaClient): ProductLinkHealthReportClient {
  return {
    productLinkHealth: {
      findMany: (args) => client.productLinkHealth.findMany(args),
    },
  };
}
