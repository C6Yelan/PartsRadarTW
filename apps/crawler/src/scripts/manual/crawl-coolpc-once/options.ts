// apps/crawler/src/scripts/manual/crawl-coolpc-once/options.ts
// 手動執行 CoolPC 爬蟲一次的參數解析工具。
// 負責解讀命令列引數，並組合 live crawl 的 workspace、快照輸出與延遲設定。

import { DEFAULT_COOLPC_CATEGORY_DELAY_MS } from "../../../coolpc/live-crawl";
import {
  DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
  resolveAllowlistedRawSnapshotStorage,
} from "../../../coolpc/raw-snapshot-storage";
import {
  getNumberArg,
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";
import { parseExternalFetchLockStaleSeconds } from "../../ops/external-fetch-lock";

// 要求使用者顯式加上此旗標，避免誤執行 live 網站抓取。
const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
// 供手動流程使用的解析結果；包含 workspace、輸出位置與抓取間隔。
export interface CrawlOptions {
  workspaceRoot: string;
  storageDir: string;
  delayMs: number;
  externalFetchLockDir: string;
  externalFetchLockStaleSeconds: number;
}

// 解析命令列引數，並回傳手動流程所需參數。
// 未帶 --confirm-live-fetch 時直接中止，以避免未授權的 live 抓取。
export function parseOptions(
  args: string[],
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  additionalAllowedStorageRootsForTesting: string[] = [],
): CrawlOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--from-raw-dir")) {
    throw new Error(
      "manual:crawl-coolpc-once no longer supports --from-raw-dir. Use manual:validate-coolpc-live -- --from-raw-dir <path> for offline raw replay.",
    );
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);

  if (!args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing live CoolPC fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this command contacts the source site and must stay manual-only.`,
    );
  }

  const { mutationRoot, storageDir } = resolveAllowlistedRawSnapshotStorage({
    workspaceRoot,
    requestedDir:
      getStringArg(args, "--storage-dir") ??
      env.SNAPSHOT_STORAGE_DIR ??
      DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
    configuredDir: env.SNAPSHOT_STORAGE_DIR,
    additionalAllowedRootsForTesting: additionalAllowedStorageRootsForTesting,
  });
  const externalFetchLockDir = resolveWorkspacePathArgument(
    workspaceRoot,
    env.EXTERNAL_FETCH_LOCK_DIR ?? `${mutationRoot}/.locks/external-fetch`,
  );

  return {
    workspaceRoot,
    storageDir,
    delayMs: getNumberArg(args, "--delay-ms", DEFAULT_COOLPC_CATEGORY_DELAY_MS),
    externalFetchLockDir,
    externalFetchLockStaleSeconds: parseExternalFetchLockStaleSeconds(
      env.EXTERNAL_FETCH_LOCK_STALE_SECONDS,
    ),
  };
}

// 輸出手動 crawler 命令的使用說明與參數範例。
function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler manual:crawl-coolpc-once -- --confirm-live-fetch [options]

Options:
  --confirm-live-fetch       Required for live CoolPC requests.
  --delay-ms <ms>            Delay between live category requests.
                             Default: ${DEFAULT_COOLPC_CATEGORY_DELAY_MS}
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Must equal the active root or its controlled child.
                             SNAPSHOT_STORAGE_DIR replaces the built-in default when set.
                             Default: SNAPSHOT_STORAGE_DIR or ${DEFAULT_RAW_SNAPSHOT_STORAGE_DIR}

Environment:
  EXTERNAL_FETCH_LOCK_DIR, EXTERNAL_FETCH_LOCK_STALE_SECONDS
`);
}
