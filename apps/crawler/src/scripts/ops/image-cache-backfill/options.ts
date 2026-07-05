// apps/crawler/src/scripts/ops/image-cache-backfill/options.ts
import { relative } from "node:path";
import {
  getNumberArg,
  getPositiveNumberArg,
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_STORAGE_DIR = "storage/product-images";
const DEFAULT_MIN_DELAY_MS = 5000;
const DEFAULT_MAX_DELAY_MS = 12000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export interface ImageBackfillOptions {
  workspaceRoot: string;
  storageDir: string;
  limit: number | null;
  productId: string | null;
  igrp: number | null;
  minDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  maxSourceBytes: number;
  dryRun: boolean;
  overwrite: boolean;
}

export interface BackfillSummary {
  selected: number;
  cached: number;
  dryRun: number;
  skipped: number;
  reused: number;
  invalid: number;
  failed: number;
  liveFetches: number;
}

export function parseOptions(
  args: string[],
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): ImageBackfillOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const dryRun = args.includes("--dry-run");

  if (!dryRun && !args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing live CoolPC image fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this command contacts the source site and must stay manual-only.`,
    );
  }

  const minDelayMs = getNumberArg(args, "--min-delay-ms", DEFAULT_MIN_DELAY_MS);
  const maxDelayMs = getNumberArg(args, "--max-delay-ms", DEFAULT_MAX_DELAY_MS);

  if (minDelayMs > maxDelayMs) {
    throw new Error("--min-delay-ms must be less than or equal to --max-delay-ms.");
  }

  return {
    workspaceRoot,
    storageDir: resolveWorkspacePathArgument(
      workspaceRoot,
      getStringArg(args, "--storage-dir") ?? env.PRODUCT_IMAGE_STORAGE_DIR ?? DEFAULT_STORAGE_DIR,
    ),
    limit: getPositiveNumberArg(args, "--limit"),
    productId: getStringArg(args, "--product-id") ?? null,
    igrp: getPositiveNumberArg(args, "--igrp"),
    minDelayMs,
    maxDelayMs,
    timeoutMs: getNumberArg(args, "--timeout-ms", DEFAULT_TIMEOUT_MS),
    maxSourceBytes: getNumberArg(args, "--max-source-bytes", DEFAULT_MAX_SOURCE_BYTES),
    dryRun,
    overwrite: args.includes("--overwrite"),
  };
}

export function printSummary(summary: BackfillSummary, options: ImageBackfillOptions): void {
  console.log("");
  console.log("Product image cache backfill finished.");
  console.log(`- Selected: ${summary.selected}`);
  console.log(`- Cached: ${summary.cached}`);
  console.log(`- Dry run: ${summary.dryRun}`);
  console.log(`- Skipped existing: ${summary.skipped}`);
  console.log(`- Reused local thumbnail: ${summary.reused}`);
  console.log(`- Invalid source URL: ${summary.invalid}`);
  console.log(`- Failed: ${summary.failed}`);
  console.log(`- Live source requests: ${summary.liveFetches}`);
  console.log(`- Output directory: ${relative(options.workspaceRoot, options.storageDir)}`);
}

function printHelp(): void {
  console.log(`Usage:
  pnpm ops:image-cache:backfill -- --dry-run --limit 10
  pnpm ops:image-cache:backfill -- --confirm-live-fetch --limit 10

Options:
  --confirm-live-fetch       Required for live CoolPC image requests.
  --dry-run                  Validate candidates and output paths without source requests.
  --limit <count>            Limit selected products.
  --product-id <uuid>        Backfill a single product.
  --igrp <number>            Backfill one enabled CoolPC category.
  --overwrite                Regenerate existing cached thumbnails.
  --min-delay-ms <ms>        Minimum randomized delay between source image requests.
                             Default: ${DEFAULT_MIN_DELAY_MS}
  --max-delay-ms <ms>        Maximum randomized delay between source image requests.
                             Default: ${DEFAULT_MAX_DELAY_MS}
  --timeout-ms <ms>          Source image request timeout.
                             Default: ${DEFAULT_TIMEOUT_MS}
  --max-source-bytes <bytes> Maximum accepted source image size.
                             Default: ${DEFAULT_MAX_SOURCE_BYTES}
  --storage-dir <path>       Output directory from the workspace root, or an absolute path.
                             Default: PRODUCT_IMAGE_STORAGE_DIR, then ${DEFAULT_STORAGE_DIR}
`);
}
