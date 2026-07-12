// apps/crawler/src/scripts/ops/image-cache-backfill/options.ts
// 解析手動商品圖片補圖 CLI 的執行選項，並輸出補圖結果摘要。

import { relative } from "node:path";
import {
  getNumberArg,
  getPositiveNumberArg,
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";
import { DEFAULT_RAW_SNAPSHOT_STORAGE_DIR } from "../../../coolpc/raw-snapshot-storage";
import { parseExternalFetchLockStaleSeconds } from "../external-fetch-lock";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_STORAGE_DIR = "storage/product-images";
const DEFAULT_MIN_DELAY_MS = 5000;
const DEFAULT_MAX_DELAY_MS = 12000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_INACTIVE_IMAGE_RETENTION_DAYS = 30;

// 手動補圖流程傳給候選查詢、圖片下載與寫檔 processor 的設定契約。
export interface ImageBackfillOptions {
  workspaceRoot: string;
  storageDir: string;
  limit: number | null;
  productId: string | null;
  igrp: number | null;
  inactiveRetentionDays: number;
  minDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  maxSourceBytes: number;
  externalFetchLockDir: string;
  externalFetchLockStaleSeconds: number;
  dryRun: boolean;
  overwrite: boolean;
}

// 彙整補圖結果的各類計數，供 CLI 結束時輸出維運摘要。
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

// 解析 image-cache backfill CLI 參數；live fetch 必須明確確認，避免誤打來源站。
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
  const confirmLiveFetch = args.includes(CONFIRM_LIVE_FETCH_FLAG);

  if (confirmLiveFetch && args.includes("--dry-run")) {
    throw new Error(
      `Do not combine --dry-run with ${CONFIRM_LIVE_FETCH_FLAG}; omit both flags for the default dry run.`,
    );
  }

  // 唯一 live truth 是明確 confirmation；裸命令與相容用 --dry-run 都不碰來源站。
  const dryRun = !confirmLiveFetch;

  const minDelayMs = getNumberArg(args, "--min-delay-ms", DEFAULT_MIN_DELAY_MS);
  const maxDelayMs = getNumberArg(args, "--max-delay-ms", DEFAULT_MAX_DELAY_MS);
  const snapshotStorageDir = env.SNAPSHOT_STORAGE_DIR ?? DEFAULT_RAW_SNAPSHOT_STORAGE_DIR;

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
    inactiveRetentionDays: getNumberArg(
      args,
      "--inactive-retention-days",
      getInactiveRetentionDays(env.IMAGE_CACHE_INACTIVE_RETENTION_DAYS),
    ),
    minDelayMs,
    maxDelayMs,
    timeoutMs: getNumberArg(args, "--timeout-ms", DEFAULT_TIMEOUT_MS),
    maxSourceBytes: getNumberArg(args, "--max-source-bytes", DEFAULT_MAX_SOURCE_BYTES),
    externalFetchLockDir: resolveWorkspacePathArgument(
      workspaceRoot,
      env.EXTERNAL_FETCH_LOCK_DIR ?? `${snapshotStorageDir}/.locks/external-fetch`,
    ),
    externalFetchLockStaleSeconds: parseExternalFetchLockStaleSeconds(
      env.EXTERNAL_FETCH_LOCK_STALE_SECONDS,
    ),
    dryRun,
    overwrite: args.includes("--overwrite"),
  };
}

// 將 processor 回傳的補圖統計輸出成 CLI 摘要，方便手動維運後確認結果。
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

// 輸出手動圖片補圖 CLI 說明；此腳本偏維運用途，不作為使用者介面文案。
function printHelp(): void {
  console.log(`Usage:
  pnpm ops:image-cache:backfill -- --limit 10
  pnpm ops:image-cache:backfill -- --confirm-live-fetch --limit 10

Options:
  --confirm-live-fetch       Send live CoolPC image requests. Without this flag the command is dry-run.
  --dry-run                  Compatibility alias for the default dry-run mode.
  --limit <count>            Limit selected products.
  --product-id <uuid>        Backfill a single product.
  --igrp <number>            Backfill one enabled CoolPC category.
  --inactive-retention-days <days>
                             Fetch missing inactive product images only when referenced by a price snapshot within this many days.
                             Default: ${DEFAULT_INACTIVE_IMAGE_RETENTION_DAYS}
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

Environment:
  IMAGE_CACHE_INACTIVE_RETENTION_DAYS, EXTERNAL_FETCH_LOCK_DIR,
  EXTERNAL_FETCH_LOCK_STALE_SECONDS, SNAPSHOT_STORAGE_DIR
`);
}

function getInactiveRetentionDays(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_INACTIVE_IMAGE_RETENTION_DAYS;
  }

  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error("IMAGE_CACHE_INACTIVE_RETENTION_DAYS must be a non-negative integer.");
  }

  return Number(raw);
}
