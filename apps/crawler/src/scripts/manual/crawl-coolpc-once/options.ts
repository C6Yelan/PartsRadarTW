// apps/crawler/src/scripts/manual/crawl-coolpc-once/options.ts
// 手動執行 CoolPC 爬蟲一次的參數解析工具。
// 負責解讀命令列引數、決定是否使用 raw 重放或 live 抓取，並組合 workspace、快照輸出與延遲設定。

import { DEFAULT_COOLPC_CATEGORY_DELAY_MS } from "../../../coolpc/live-crawl";
import {
  getNumberArg,
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";

// 未指定 --from-raw-dir 時，要求使用者顯式加上此旗標，避免誤執行 live 網站抓取。
const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
// 手動流程預設輸出的快照目錄（以 workspace 根目錄為準）。
const DEFAULT_STORAGE_DIR = "temp/coolpc-manual-crawl/snapshots";

// 供手動流程使用的解析結果；包含 workspace、快照來源、輸出位置與抓取間隔。
export interface CrawlOptions {
  workspaceRoot: string;
  fromRawDir: string | null;
  storageDir: string;
  delayMs: number;
}

// 解析命令列引數，並回傳手動流程所需參數。
// 如果未指定 --from-raw-dir，且未帶 --confirm-live-fetch，直接中止以避免未授權的 live 抓取。
export function parseOptions(args: string[]): CrawlOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const fromRawDirArg = getStringArg(args, "--from-raw-dir");
  const fromRawDir = fromRawDirArg
    ? resolveWorkspacePathArgument(workspaceRoot, fromRawDirArg)
    : null;

  if (!fromRawDir && !args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing live CoolPC fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this command contacts the source site and must stay manual-only.`,
    );
  }

  return {
    workspaceRoot,
    fromRawDir,
    storageDir: resolveWorkspacePathArgument(
      workspaceRoot,
      getStringArg(args, "--storage-dir") ??
        process.env.SNAPSHOT_STORAGE_DIR ??
        DEFAULT_STORAGE_DIR,
    ),
    delayMs: getNumberArg(args, "--delay-ms", DEFAULT_COOLPC_CATEGORY_DELAY_MS),
  };
}

// 輸出手動 crawler 命令的使用說明與參數範例。
function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler manual:crawl-coolpc-once -- --from-raw-dir <path>
  pnpm --filter @partsradar/crawler manual:crawl-coolpc-once -- --confirm-live-fetch [options]

Options:
  --from-raw-dir <path>      Replay saved raw HTML from the workspace root.
                             Expected files: igrp-4.html, igrp-5.html, ...
  --confirm-live-fetch       Required for live CoolPC requests.
  --delay-ms <ms>            Delay between live category requests.
                             Default: ${DEFAULT_COOLPC_CATEGORY_DELAY_MS}
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Default: ${DEFAULT_STORAGE_DIR}
`);
}
