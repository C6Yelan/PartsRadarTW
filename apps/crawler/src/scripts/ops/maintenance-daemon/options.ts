// apps/crawler/src/scripts/ops/maintenance-daemon/options.ts
// 解析 maintenance daemon 的排程、外部請求鎖與商品連結健康檢查設定。

import {
  type ProductLinkCheckerOptions,
  parseOptions as parseProductLinkOptions,
} from "../product-link-checker/options";
import {
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";
import {
  DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
} from "../external-fetch-lock";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DRY_RUN_FLAG = "--dry-run";
export const HELP_FLAG = "--help";
const RUN_ONCE_FLAG = "--run-once";
const DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_MAINTENANCE_INITIAL_DELAY_SECONDS = 15 * 60;
const DEFAULT_PRICE_PRIORITY_PAUSE_SECONDS = 5 * 60;
const MIN_MAINTENANCE_INTERVAL_SECONDS = 60 * 60;
const MAX_MAINTENANCE_INTERVAL_SECONDS = 7 * 24 * 60 * 60;
const MIN_NON_NEGATIVE_SECONDS = 0;
const MAX_INITIAL_DELAY_SECONDS = 24 * 60 * 60;
const MIN_PRICE_PRIORITY_PAUSE_SECONDS = 60;
const MAX_PRICE_PRIORITY_PAUSE_SECONDS = 60 * 60;
const DEFAULT_LINK_LIMIT = 200;

// maintenance daemon 的完整執行設定，包含自身排程與內部 product-link checker 子任務設定。
export interface MaintenanceDaemonOptions {
  workspaceRoot: string;
  dryRun: boolean;
  runOnce: boolean;
  intervalSeconds: number;
  initialDelaySeconds: number;
  pricePriorityPauseSeconds: number;
  prioritySignalTtlSeconds: number;
  lockDir: string;
  lockStaleSeconds: number;
  link: ProductLinkCheckerOptions;
}

// 解析 maintenance daemon CLI/env 設定；live 模式目前必須明確確認，避免長駐任務誤打外部網站。
export function parseMaintenanceDaemonOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): MaintenanceDaemonOptions {
  if (args.includes(HELP_FLAG)) {
    printHelp();
    process.exit(0);
  }

  const dryRun = args.includes(DRY_RUN_FLAG);

  if (!dryRun && !args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing scheduled maintenance live fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this daemon contacts external sites repeatedly.`,
    );
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const lockDir = resolveWorkspacePathArgument(
    workspaceRoot,
    getStringArg(args, "--lock-dir") ?? env.EXTERNAL_FETCH_LOCK_DIR ?? "temp/external-fetch.lock",
  );

  return {
    workspaceRoot,
    dryRun,
    runOnce: args.includes(RUN_ONCE_FLAG),
    intervalSeconds: parseIntegerOption({
      args,
      env,
      argName: "--interval-seconds",
      envName: "MAINTENANCE_INTERVAL_SECONDS",
      fallback: DEFAULT_MAINTENANCE_INTERVAL_SECONDS,
      min: MIN_MAINTENANCE_INTERVAL_SECONDS,
      max: MAX_MAINTENANCE_INTERVAL_SECONDS,
    }),
    initialDelaySeconds: parseIntegerOption({
      args,
      env,
      argName: "--initial-delay-seconds",
      envName: "MAINTENANCE_INITIAL_DELAY_SECONDS",
      fallback: DEFAULT_MAINTENANCE_INITIAL_DELAY_SECONDS,
      min: MIN_NON_NEGATIVE_SECONDS,
      max: MAX_INITIAL_DELAY_SECONDS,
    }),
    pricePriorityPauseSeconds: parseIntegerOption({
      args,
      env,
      argName: "--price-priority-pause-seconds",
      envName: "MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS",
      fallback: DEFAULT_PRICE_PRIORITY_PAUSE_SECONDS,
      min: MIN_PRICE_PRIORITY_PAUSE_SECONDS,
      max: MAX_PRICE_PRIORITY_PAUSE_SECONDS,
    }),
    prioritySignalTtlSeconds: parseIntegerOption({
      args,
      env,
      argName: "--priority-signal-ttl-seconds",
      envName: "EXTERNAL_FETCH_PRIORITY_TTL_SECONDS",
      fallback: DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
      min: 60,
      max: 60 * 60,
    }),
    lockDir,
    lockStaleSeconds: parseIntegerOption({
      args,
      env,
      argName: "--lock-stale-seconds",
      envName: "EXTERNAL_FETCH_LOCK_STALE_SECONDS",
      fallback: DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
      min: 60,
      max: 7 * 24 * 60 * 60,
    }),
    link: parseProductLinkOptions(buildProductLinkArgs(args, env, dryRun), cwd),
  };
}

// 將 maintenance daemon 的 link 子任務設定轉成 product-link checker 既有 parser 可接受的參數。
function buildProductLinkArgs(args: string[], env: NodeJS.ProcessEnv, dryRun: boolean): string[] {
  const linkArgs = dryRun ? [DRY_RUN_FLAG] : [CONFIRM_LIVE_FETCH_FLAG];
  appendOption(
    linkArgs,
    "--limit",
    getStringArg(args, "--link-limit") ?? env.MAINTENANCE_LINK_LIMIT ?? String(DEFAULT_LINK_LIMIT),
  );
  appendOption(
    linkArgs,
    "--stale-after-hours",
    getStringArg(args, "--link-stale-after-hours") ??
      env.MAINTENANCE_LINK_STALE_AFTER_HOURS ??
      "168",
  );
  appendOption(
    linkArgs,
    "--min-delay-ms",
    getStringArg(args, "--link-min-delay-ms") ?? env.MAINTENANCE_LINK_MIN_DELAY_MS ?? "10000",
  );
  appendOption(
    linkArgs,
    "--max-delay-ms",
    getStringArg(args, "--link-max-delay-ms") ?? env.MAINTENANCE_LINK_MAX_DELAY_MS ?? "20000",
  );
  appendOption(
    linkArgs,
    "--timeout-ms",
    getStringArg(args, "--link-timeout-ms") ?? env.MAINTENANCE_LINK_TIMEOUT_MS ?? "10000",
  );

  return linkArgs;
}

// 保留參數組裝集中在 buildProductLinkArgs()，避免每個 link option 重複 push 樣板。
function appendOption(args: string[], name: string, value: string): void {
  args.push(name, value);
}

// 解析帶上下限的秒數設定，讓 CLI 與 env 使用同一套錯誤訊息與安全範圍。
function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = getStringArg(args, argName) ?? env[envName] ?? String(fallback);
  const errorMessage = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(errorMessage);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(errorMessage);
  }

  return value;
}

// 輸出 maintenance daemon CLI 說明；正式部署設定仍以 env / Compose / runbook 為主。
export function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:maintenance-daemon -- --confirm-live-fetch [options]
  pnpm --filter @partsradar/crawler ops:maintenance-daemon -- --dry-run --run-once [options]

Options:
  --confirm-live-fetch          Required for scheduled live external requests.
  --dry-run                     Run selection only; no external requests or writes.
  --run-once                    Run one maintenance cycle and exit.
  --interval-seconds <sec>      Delay between maintenance cycles.
                                Default: ${DEFAULT_MAINTENANCE_INTERVAL_SECONDS}
  --initial-delay-seconds <sec> Delay before the first cycle in daemon mode.
                                Default: ${DEFAULT_MAINTENANCE_INITIAL_DELAY_SECONDS}
  --price-priority-pause-seconds <sec>
                                Delay before resuming after yielding to the price crawler.
                                Default: ${DEFAULT_PRICE_PRIORITY_PAUSE_SECONDS}
  --link-limit <count>          Maximum due product links per cycle.
                                Default: ${DEFAULT_LINK_LIMIT}
  --lock-dir <path>             Shared external fetch lock directory.
                                Default: EXTERNAL_FETCH_LOCK_DIR, then temp/external-fetch.lock
  --lock-stale-seconds <sec>    Break stale external fetch locks after this age.
                                Default: ${DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS}
  --priority-signal-ttl-seconds <sec>
                                Higher-priority external fetch signal TTL.
                                Default: ${DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS}
  --help                        Show this help message.
`);
}
