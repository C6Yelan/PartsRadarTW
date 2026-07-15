// apps/crawler/src/scripts/ops/production-smoke.ts
// 提供單次 production smoke CLI 入口，並集中轉出 production-smoke 子模組的公開 API。

import type { PrismaClient } from "@partsradar/db";
import { loadWorkspaceEnv, resolveWorkspaceRoot, toSafeCliErrorMessage } from "../shared/script-utils";
import { HELP_FLAG } from "./production-smoke/constants";
import { runProductionPublicSmoke, runProductionSmoke } from "./production-smoke/checks";
import { parseProductionSmokeOptions } from "./production-smoke/options";
import { printProductionSmokeHelp } from "./production-smoke/options/help";
import { printProductionSmokeSummary } from "./production-smoke/summary";

export { runProductionPublicSmoke, runProductionSmoke } from "./production-smoke/checks";
export { parseProductionSmokeOptions } from "./production-smoke/options";
export { printProductionSmokeSummary } from "./production-smoke/summary";
export type {
  ProductionSmokeClient,
  ProductionSmokeOptions,
  ProductionSmokeSummary,
  SmokeCheckResult,
  SmokeStatus,
} from "./production-smoke/types";

// 依 CLI 參數執行 public-only 或完整 production smoke，並以 FAIL 決定程序退出碼。
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes(HELP_FLAG)) {
    printProductionSmokeHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseProductionSmokeOptions(args);
  let client: PrismaClient | null = null;

  try {
    if (options.publicOnly) {
      const summary = await runProductionPublicSmoke(options);
      printProductionSmokeSummary(summary);

      if (summary.status === "FAIL") {
        process.exitCode = 1;
      }

      return;
    }

    const db = await import("@partsradar/db");
    client = db.prisma;
    const summary = await runProductionSmoke(client, options);
    printProductionSmokeSummary(summary);

    if (summary.status === "FAIL") {
      process.exitCode = 1;
    }
  } finally {
    await client?.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
