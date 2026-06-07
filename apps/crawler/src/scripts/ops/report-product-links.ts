// apps/crawler/src/scripts/ops/report-product-links.ts
// Read-only diagnostic report for persisted product link health rows.
import type { PrismaClient } from "@partsradar/db";
import { loadWorkspaceEnv, toSafeCliErrorMessage } from "../shared/script-utils";
import {
  formatProductLinkHealthReport,
  parseProductLinkHealthReportOptions,
  readProductLinkHealthReport,
  type ProductLinkHealthReportClient,
} from "./product-link-health-report";

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

function toReportClient(client: PrismaClient): ProductLinkHealthReportClient {
  return {
    productLinkHealth: {
      findMany: (args) => client.productLinkHealth.findMany(args),
    },
  };
}
