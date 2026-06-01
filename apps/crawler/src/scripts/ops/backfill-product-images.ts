// This script is a manual image-cache backfill tool for local validation.
// It downloads source product images at a low, jittered rate and writes small WebP thumbnails.
// Do not use this as the production scheduled crawler entrypoint.
import type { PrismaClient } from "@partsradar/db";
import { loadWorkspaceEnv, toSafeCliErrorMessage } from "../shared/script-utils";
import { parseOptions, printSummary } from "./image-cache-backfill/options";
import { backfillImages, readCandidates } from "./image-cache-backfill/processor";

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;

    const candidates = await readCandidates(client, options);
    const summary = await backfillImages(candidates, options);

    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

main().catch((error) => {
  console.error(toSafeCliErrorMessage(error));
  process.exitCode = 1;
});
