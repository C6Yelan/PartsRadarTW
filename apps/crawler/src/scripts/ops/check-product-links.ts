// apps/crawler/src/scripts/ops/check-product-links.ts
// This script is a low-frequency product link health checker.
// It records link status for UI hints only; it does not remove or deactivate products.
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
