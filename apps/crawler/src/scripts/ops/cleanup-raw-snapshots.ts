// apps/crawler/src/scripts/ops/cleanup-raw-snapshots.ts
// 手動執行 raw snapshot 保留規則清理，預設 dry-run，只有明確確認後才刪 metadata 與孤立 gzip 檔。

import { isAbsolute, relative, resolve } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import {
  type CleanupRawSnapshotsResult,
  cleanupRawSnapshotsWithPrisma,
  DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
  DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
  type PrismaRawSnapshotCleanupClient,
} from "../../coolpc/raw-snapshot-cleanup";
import {
  DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
  resolveAllowlistedRawSnapshotStorage,
  tryAcquireRawSnapshotMutationLock,
} from "../../coolpc/raw-snapshot-storage";
import {
  getNumberArg,
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { formatTaipeiDateTime, TAIPEI_TIME_ZONE } from "./shared/time";

const CONFIRM_DELETE_FLAG = "--confirm-delete";
const HELP_FLAG = "--help";
const VALUE_FLAGS = new Set([
  "--storage-dir",
  "--normal-retention-days",
  "--abnormal-retention-days",
]);
const BOOLEAN_FLAGS = new Set([HELP_FLAG, CONFIRM_DELETE_FLAG]);
const ALLOWED_FLAGS = new Set([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);

export interface CleanupOptions {
  workspaceRoot: string;
  storageDir: string;
  mutationRoot: string;
  storagePathPrefix: string;
  normalRetentionDays: number;
  abnormalRetentionDays: number;
  dryRun: boolean;
}

export type RawSnapshotCleanupExecutor = (options: {
  client: PrismaRawSnapshotCleanupClient;
  storageDir: string;
  normalRetentionDays: number;
  abnormalRetentionDays: number;
  dryRun: boolean;
}) => Promise<CleanupRawSnapshotsResult>;

interface CleanupStorageValidationOptions {
  additionalAllowedRootsForTesting?: string[];
}

// CLI 入口：載入 env、建立 Prisma client，並執行一次 raw snapshot cleanup。
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes(HELP_FLAG)) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseCleanupOptions(args, workspaceRoot);
  let client: PrismaClient | null = null;

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    const result = await runRawSnapshotCleanup({
      client,
      options,
      owner: "raw-snapshot-cleanup",
    });

    printSummary(options, result);
  } finally {
    await client?.$disconnect();
  }
}

// 解析 one-shot cleanup 參數；未帶 --confirm-delete 時維持 dry-run，避免手動維運誤刪。
export function parseCleanupOptions(
  args: string[],
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  validationOptions: CleanupStorageValidationOptions = {},
): CleanupOptions {
  const normalizedArgs = normalizeCleanupArgs(args);
  validateCleanupArgs(normalizedArgs);

  const normalRetentionDays = getNumberArg(
    normalizedArgs,
    "--normal-retention-days",
    DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
  );
  const abnormalRetentionDays = getNumberArg(
    normalizedArgs,
    "--abnormal-retention-days",
    DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
  );

  validateRetentionDays(normalRetentionDays, "--normal-retention-days");
  validateRetentionDays(abnormalRetentionDays, "--abnormal-retention-days");

  const storageLocation = resolveAllowlistedRawSnapshotStorage({
    workspaceRoot,
    requestedDir:
      getStringArgAllowingEmpty(normalizedArgs, "--storage-dir") ??
      env.SNAPSHOT_STORAGE_DIR ??
      DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
    configuredDir: env.SNAPSHOT_STORAGE_DIR,
    additionalAllowedRootsForTesting: validationOptions.additionalAllowedRootsForTesting,
  });

  return {
    workspaceRoot,
    ...storageLocation,
    normalRetentionDays,
    abnormalRetentionDays,
    dryRun: !normalizedArgs.includes(CONFIRM_DELETE_FLAG),
  };
}

// confirmed cleanup 與所有 raw writers 共用 matched root 的 mutation lock；dry-run 保持純讀取。
export async function runRawSnapshotCleanup({
  client,
  options,
  owner,
  cleanup = cleanupRawSnapshotsWithPrisma,
  acquireMutationLock = tryAcquireRawSnapshotMutationLock,
}: {
  client: PrismaRawSnapshotCleanupClient;
  options: CleanupOptions;
  owner: string;
  cleanup?: RawSnapshotCleanupExecutor;
  acquireMutationLock?: typeof tryAcquireRawSnapshotMutationLock;
}): Promise<CleanupRawSnapshotsResult> {
  const cleanupOptions = {
    client,
    storageDir: options.mutationRoot,
    normalRetentionDays: options.normalRetentionDays,
    abnormalRetentionDays: options.abnormalRetentionDays,
    dryRun: options.dryRun,
  };

  if (options.dryRun) {
    return cleanup(cleanupOptions);
  }

  const lock = await acquireMutationLock({
    mutationRoot: options.mutationRoot,
    owner,
  });

  if (!lock) {
    throw new Error(
      "Raw snapshot storage is busy; another crawler or cleanup process holds the mutation lock.",
    );
  }

  try {
    return await cleanup(cleanupOptions);
  } finally {
    await lock.release();
  }
}

// 驗證 CLI 參數只包含明確允許的 flag，避免拼字錯誤被默默忽略。
export function validateCleanupArgs(args: string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected raw snapshot cleanup argument: ${arg}`);
    }

    if (!ALLOWED_FLAGS.has(arg)) {
      throw new Error(`Unknown raw snapshot cleanup option: ${arg}`);
    }

    if (!VALUE_FLAGS.has(arg)) {
      continue;
    }

    const value = args[index + 1];

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }

    index += 1;
  }
}

// 移除 pnpm script 可能傳入的分隔符，讓後續 flag 驗證只處理實際 cleanup 參數。
export function normalizeCleanupArgs(args: string[]): string[] {
  return args.filter((arg) => arg !== "--");
}

// 將 storage path 轉成摘要用文字；工作區內顯示相對路徑，工作區外保留絕對路徑。
export function formatStorageDirForSummary(workspaceRoot: string, storageDir: string): string {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const resolvedStorageDir = resolve(storageDir);
  const relativePath = relative(resolvedWorkspaceRoot, resolvedStorageDir);

  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return relativePath || ".";
  }

  return resolvedStorageDir;
}

// 允許測試覆蓋空字串 storage-dir，讓 allowlist validator 的防呆能被直接驗證。
function getStringArgAllowingEmpty(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

// 保留天數必須是正整數，避免 cutoff 計算出現無效或反向保留期。
function validateRetentionDays(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

// 輸出 one-shot cleanup 摘要；dry-run 會提示需要 --confirm-delete 才會真正刪除。
function printSummary(
  options: CleanupOptions,
  result: Awaited<ReturnType<typeof cleanupRawSnapshotsWithPrisma>>,
): void {
  console.log("");
  console.log("Raw snapshot cleanup finished.");
  console.log(`- Mode: ${result.dryRun ? "dry run" : "delete"}`);
  console.log(
    `- Snapshot storage: ${formatStorageDirForSummary(options.workspaceRoot, options.storageDir)}`,
  );
  console.log(
    `- Normal retention: ${options.normalRetentionDays} days, cutoff (${TAIPEI_TIME_ZONE}) ${formatTaipeiDateTime(result.normalCutoff)}; cutoff (UTC) ${result.normalCutoff.toISOString()}`,
  );
  console.log(
    `- Abnormal retention: ${options.abnormalRetentionDays} days, cutoff (${TAIPEI_TIME_ZONE}) ${formatTaipeiDateTime(result.abnormalCutoff)}; cutoff (UTC) ${result.abnormalCutoff.toISOString()}`,
  );
  console.log(`- Metadata candidates: ${result.candidateMetadataCount}`);
  console.log(`- Metadata deleted: ${result.deletedMetadataCount}`);
  console.log(`- Candidate compressed file paths: ${result.candidateCompressedFilePathCount}`);
  console.log(`- Retained compressed file paths: ${result.retainedCompressedFilePathCount}`);
  console.log(`- Deletable compressed file paths: ${result.deletableCompressedFilePathCount}`);
  console.log(`- Compressed files deleted: ${result.deletedCompressedFileCount}`);
  console.log(`- Compressed files already missing: ${result.missingCompressedFileCount}`);

  if (result.dryRun) {
    console.log("");
    console.log(
      `Re-run with ${CONFIRM_DELETE_FLAG} to delete the listed candidate metadata/files.`,
    );
  }
}

// 輸出手動 raw snapshot cleanup CLI 說明，強調預設 dry-run 與刪除前確認。
function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup -- --confirm-delete [options]

Options:
  --confirm-delete                Delete eligible raw snapshot metadata and unreferenced gzip files.
                                  Without this flag the command only prints a dry-run summary.
  --normal-retention-days <days>  Retention for VALID snapshots.
                                  Default: ${DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS}
  --abnormal-retention-days <days>
                                  Retention for INVALID and SUSPECTED_BLOCK snapshots.
                                  Default: ${DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS}
  --storage-dir <path>            Snapshot storage directory from the workspace root.
                                  Must equal the active root or its controlled child.
                                  SNAPSHOT_STORAGE_DIR replaces the built-in default when set.
                                  Default: SNAPSHOT_STORAGE_DIR or ${DEFAULT_RAW_SNAPSHOT_STORAGE_DIR}

Safety:
  Confirmed deletion stops if a crawler/replay holds the raw snapshot mutation lock.
  Dry-run does not acquire or modify that lock.
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
