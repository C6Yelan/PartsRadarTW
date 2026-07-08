// apps/crawler/src/scripts/ops/cleanup-raw-snapshots.ts
// 手動執行 raw snapshot 保留規則清理，預設 dry-run，只有明確確認後才刪 metadata 與孤立 gzip 檔。

import { isAbsolute, parse, relative, resolve } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import {
  DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
  DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
  cleanupRawSnapshotsWithPrisma,
} from "../../coolpc/raw-snapshot-cleanup";
import {
  getNumberArg,
  loadWorkspaceEnv,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

const CONFIRM_DELETE_FLAG = "--confirm-delete";
const HELP_FLAG = "--help";
const DEFAULT_STORAGE_DIR = "temp/coolpc-daemon/snapshots";
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
  normalRetentionDays: number;
  abnormalRetentionDays: number;
  dryRun: boolean;
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

    const result = await cleanupRawSnapshotsWithPrisma({
      client,
      storageDir: options.storageDir,
      normalRetentionDays: options.normalRetentionDays,
      abnormalRetentionDays: options.abnormalRetentionDays,
      dryRun: options.dryRun,
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

  return {
    workspaceRoot,
    storageDir: resolveAndValidateStorageDir(
      workspaceRoot,
      getStringArgAllowingEmpty(normalizedArgs, "--storage-dir") ??
        env.SNAPSHOT_STORAGE_DIR ??
        DEFAULT_STORAGE_DIR,
    ),
    normalRetentionDays,
    abnormalRetentionDays,
    dryRun: !normalizedArgs.includes(CONFIRM_DELETE_FLAG),
  };
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

// 擋下空值、filesystem root 與 workspace root，避免 cleanup 對過大的目錄範圍執行刪除。
export function validateStorageDir(storageDir: string, workspaceRoot: string): string {
  const resolvedStorageDir = resolve(storageDir);
  const resolvedWorkspaceRoot = resolve(workspaceRoot);

  if (storageDir.trim() === "") {
    throw new Error(`Unsafe snapshot storage dir "${storageDir}": value must not be empty.`);
  }

  if (isFilesystemRoot(resolvedStorageDir)) {
    throw new Error(`Unsafe snapshot storage dir "${storageDir}": filesystem root cannot be used.`);
  }

  if (resolvedStorageDir === resolvedWorkspaceRoot) {
    throw new Error(`Unsafe snapshot storage dir "${storageDir}": workspace root cannot be used.`);
  }

  return resolvedStorageDir;
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

// 先套用 workspace-relative path 解析，再走刪除目錄安全檢查。
function resolveAndValidateStorageDir(workspaceRoot: string, storageDir: string): string {
  if (storageDir.trim() === "") {
    throw new Error(`Unsafe snapshot storage dir "${storageDir}": value must not be empty.`);
  }

  return validateStorageDir(resolveWorkspacePathArgument(workspaceRoot, storageDir), workspaceRoot);
}

// 允許測試覆蓋空字串 storage-dir，讓 validateStorageDir 的防呆能被直接驗證。
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

// 判斷指定 path 是否為 filesystem root，供 storage-dir 安全檢查使用。
function isFilesystemRoot(path: string): boolean {
  const root = parse(path).root;

  return root !== "" && path === root;
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
    `- Normal retention: ${options.normalRetentionDays} days, cutoff ${result.normalCutoff.toISOString()}`,
  );
  console.log(
    `- Abnormal retention: ${options.abnormalRetentionDays} days, cutoff ${result.abnormalCutoff.toISOString()}`,
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
                                  Default: SNAPSHOT_STORAGE_DIR or ${DEFAULT_STORAGE_DIR}

Safety:
  Do not run this cleanup while manual crawler, scheduled crawler, or raw replay writes are running.
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
