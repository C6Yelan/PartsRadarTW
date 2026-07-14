// apps/crawler/src/scripts/ops/production-smoke-daemon/options.ts
// 解析 production smoke daemon 的排程參數，並合併單輪 smoke 與 Discord 告警設定。

import { getStringArg } from "../../shared/script-utils";
import { type ProductionSmokeOptions, parseProductionSmokeOptions } from "../production-smoke";
import {
  parseSmokeDiscordNotificationOptions,
  type SmokeDiscordNotificationOptions,
} from "../smoke-discord-notification";

export const HELP_FLAG = "--help";
const RUN_ONCE_FLAG = "--run-once";
const DEFAULT_SMOKE_INTERVAL_SECONDS = 300;
const DEFAULT_SMOKE_INITIAL_DELAY_SECONDS = 60;
const DEFAULT_SMOKE_CYCLE_TIMEOUT_MS = 30_000;
const MIN_SMOKE_INTERVAL_SECONDS = 60;
const MAX_SMOKE_INTERVAL_SECONDS = 24 * 60 * 60;
const MIN_INITIAL_DELAY_SECONDS = 0;
const MAX_INITIAL_DELAY_SECONDS = 24 * 60 * 60;
const MIN_SMOKE_CYCLE_TIMEOUT_MS = 5_000;
const MAX_SMOKE_CYCLE_TIMEOUT_MS = 300_000;

// daemon 執行設定；包含單輪 production smoke options、循環排程與 Discord admin webhook 告警設定。
export interface ProductionSmokeDaemonOptions extends ProductionSmokeOptions {
  intervalSeconds: number;
  initialDelaySeconds: number;
  cycleTimeoutMs: number;
  runOnce: boolean;
  smokeDiscordNotification: SmokeDiscordNotificationOptions;
}

// 將 CLI args / env 解析成 daemon 設定，讓長駐 daemon 與 run-once 模式共用同一套參數。
export function parseProductionSmokeDaemonOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ProductionSmokeDaemonOptions {
  if (args.includes(HELP_FLAG)) {
    printHelp();
    process.exit(0);
  }

  const smokeOptions = parseProductionSmokeOptions(args, env, cwd);

  return {
    ...smokeOptions,
    intervalSeconds: parseIntegerOption({
      args,
      env,
      argName: "--interval-seconds",
      envName: "SMOKE_INTERVAL_SECONDS",
      fallback: DEFAULT_SMOKE_INTERVAL_SECONDS,
      min: MIN_SMOKE_INTERVAL_SECONDS,
      max: MAX_SMOKE_INTERVAL_SECONDS,
    }),
    initialDelaySeconds: parseIntegerOption({
      args,
      env,
      argName: "--initial-delay-seconds",
      envName: "SMOKE_INITIAL_DELAY_SECONDS",
      fallback: DEFAULT_SMOKE_INITIAL_DELAY_SECONDS,
      min: MIN_INITIAL_DELAY_SECONDS,
      max: MAX_INITIAL_DELAY_SECONDS,
    }),
    cycleTimeoutMs: parseIntegerOption({
      args,
      env,
      argName: "--cycle-timeout-ms",
      envName: "SMOKE_CYCLE_TIMEOUT_MS",
      fallback: DEFAULT_SMOKE_CYCLE_TIMEOUT_MS,
      min: MIN_SMOKE_CYCLE_TIMEOUT_MS,
      max: MAX_SMOKE_CYCLE_TIMEOUT_MS,
    }),
    runOnce: args.includes(RUN_ONCE_FLAG),
    smokeDiscordNotification: parseSmokeDiscordNotificationOptions(
      args,
      env,
      smokeOptions.workspaceRoot,
    ),
  };
}

// 解析 daemon 專屬整數 option，限制 interval 與 initial delay 不被誤設成無效或極端值。
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
  const message = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}

// 輸出 production smoke daemon 的手動啟動說明；完整 smoke 門檻仍由 production smoke help / runbook 說明。
export function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:production-smoke-daemon -- [options]

Options:
  --run-once                         Run one smoke check and exit.
  --interval-seconds <sec>           Delay between smoke checks.
                                     Default: ${DEFAULT_SMOKE_INTERVAL_SECONDS}
  --initial-delay-seconds <sec>      Delay before the first daemon check.
                                     Default: ${DEFAULT_SMOKE_INITIAL_DELAY_SECONDS}
  --cycle-timeout-ms <ms>            Fatal whole-cycle timeout.
                                     Default: ${DEFAULT_SMOKE_CYCLE_TIMEOUT_MS}
  --smoke-discord-state-file <path>  State file for Discord smoke notification dedupe.
  --smoke-discord-cooldown-seconds <sec>
                                     Delay before repeating unchanged Discord alerts.

The daemon also accepts production smoke options such as --base-url and --timeout-ms.
`);
}
