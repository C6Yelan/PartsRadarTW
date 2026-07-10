// apps/crawler/src/scripts/ops/production-smoke-daemon.ts
// 以 daemon 形式定期執行 production smoke，並把異常與恢復狀態送往維運 Discord webhook。

import type { PrismaClient } from "@partsradar/db";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import {
  type DiscordWebhookSendOptions,
  type DiscordWebhookSendResult,
  sendDiscordWebhookMessage,
} from "./discord-webhook";
import type { ProductionSmokeSummary, SmokeStatus } from "./production-smoke";
import { runProductionSmoke } from "./production-smoke";
import {
  HELP_FLAG,
  type ProductionSmokeDaemonOptions,
  parseProductionSmokeDaemonOptions,
  printHelp,
} from "./production-smoke-daemon/options";
import { createOpsLogger } from "./shared/logger";
import {
  createSmokeDiscordNotificationDecision,
  readSmokeDiscordNotificationState,
  type SmokeDiscordNotificationOptions,
  writeSmokeDiscordNotificationState,
} from "./smoke-discord-notification";

const logger = createOpsLogger();

export type { ProductionSmokeDaemonOptions } from "./production-smoke-daemon/options";
export { parseProductionSmokeDaemonOptions } from "./production-smoke-daemon/options";

// daemon shutdown 抽象，讓測試能控制停止狀態與 sleep 行為。
export interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

// production smoke daemon 的可注入依賴，供 CLI entrypoint 與單元測試共用。
interface RunProductionSmokeDaemonOptions {
  client: PrismaClient;
  options: ProductionSmokeDaemonOptions;
  shutdown: ShutdownController;
  logMessage?: (message: string) => void;
  sendDiscordWebhook?: (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>;
}

// 解析環境與 CLI 設定後啟動 daemon，並在結束時釋放 Prisma 連線。
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes(HELP_FLAG)) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseProductionSmokeDaemonOptions(args);
  let client: PrismaClient | null = null;
  const shutdown = createShutdownController();

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    log(
      `Production smoke daemon started. interval=${options.intervalSeconds}s initialDelay=${options.initialDelaySeconds}s runOnce=${options.runOnce ? "yes" : "no"} baseUrl=${toSafeCliErrorMessage(options.baseUrl)}`,
    );
    await runProductionSmokeDaemon({ client, options, shutdown });
  } finally {
    await client?.$disconnect();
    log("Production smoke daemon stopped.");
  }
}

export async function runProductionSmokeDaemon({
  client,
  options,
  shutdown,
  logMessage = log,
  sendDiscordWebhook = sendDiscordWebhookMessage,
}: RunProductionSmokeDaemonOptions): Promise<void> {
  if (!options.runOnce && options.initialDelaySeconds > 0) {
    logMessage(`Waiting ${options.initialDelaySeconds}s before first production smoke check.`);
    await shutdown.sleep(options.initialDelaySeconds * 1000);
  }

  do {
    try {
      const summary = await runProductionSmoke(client, options);
      logProductionSmokeDaemonSummary(summary, logMessage);
      await handleSmokeDiscordNotification({
        summary,
        options: options.smokeDiscordNotification,
        logMessage,
        sendDiscordWebhook,
      });
    } catch (error) {
      logMessage(`Production smoke check failed before summary: ${toSafeCliErrorMessage(error)}`);

      if (options.runOnce) {
        throw error;
      }
    }

    if (options.runOnce || shutdown.requested) {
      break;
    }

    const nextRunAt = new Date(Date.now() + options.intervalSeconds * 1000).toISOString();
    logMessage(`Next production smoke check at ${nextRunAt} (${options.intervalSeconds}s).`);
    await shutdown.sleep(options.intervalSeconds * 1000);
  } while (!shutdown.requested);
}

// 輸出每輪 smoke 結果摘要；OK 只統計數量，WARN/FAIL 另外列出問題方便維運追查。
export function logProductionSmokeDaemonSummary(
  summary: ProductionSmokeSummary,
  logMessage: (message: string) => void,
): void {
  const counts = countChecksByStatus(summary);

  logMessage(
    `Production smoke finished. status=${summary.status} ok=${counts.OK} warn=${counts.WARN} fail=${counts.FAIL}`,
  );

  for (const check of summary.checks) {
    if (check.status === "OK") {
      continue;
    }

    logMessage(
      `Production smoke issue. status=${check.status} check=${check.name} message=${toSafeCliErrorMessage(check.message)}`,
    );
  }
}

// 計算單輪 smoke check 的狀態分布，供 daemon log 保持固定格式。
function countChecksByStatus(summary: ProductionSmokeSummary): Record<SmokeStatus, number> {
  const counts: Record<SmokeStatus, number> = { OK: 0, WARN: 0, FAIL: 0 };

  for (const check of summary.checks) {
    counts[check.status] += 1;
  }

  return counts;
}

// 依 smoke 結果與上次通知狀態決定是否發送 Discord 告警，並更新去重 state。
async function handleSmokeDiscordNotification({
  summary,
  options,
  logMessage,
  sendDiscordWebhook,
}: {
  summary: Awaited<ReturnType<typeof runProductionSmoke>>;
  options: SmokeDiscordNotificationOptions;
  logMessage: (message: string) => void;
  sendDiscordWebhook: (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>;
}): Promise<void> {
  if (!options.adminWebhookUrl) {
    return;
  }

  let previousState = null;

  try {
    previousState = await readSmokeDiscordNotificationState(options.stateFilePath);
  } catch (error) {
    logMessage(
      `Smoke Discord notification state could not be read; treating as empty state: ${toSafeCliErrorMessage(error)}`,
    );
  }

  const decision = createSmokeDiscordNotificationDecision({
    summary,
    previousState,
    options,
  });

  if (decision.action === "skip") {
    if (decision.nextState) {
      await writeSmokeDiscordNotificationStateSafely({
        path: options.stateFilePath,
        state: decision.nextState,
        logMessage,
      });
    }

    return;
  }

  const result = await sendDiscordWebhook({
    webhookUrl: options.adminWebhookUrl,
    message: decision.message,
  });

  if (result.status === "sent") {
    await writeSmokeDiscordNotificationStateSafely({
      path: options.stateFilePath,
      state: decision.nextState,
      logMessage,
    });
    logMessage(
      `Smoke Discord notification sent. kind=${decision.kind} httpStatus=${result.httpStatus}`,
    );
    return;
  }

  if (result.status === "rate_limited") {
    logMessage(
      `Smoke Discord notification rate limited. retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`,
    );
    return;
  }

  if (result.status === "failed") {
    logMessage(
      `Smoke Discord notification failed. httpStatus=${result.httpStatus ?? "none"} message=${toSafeCliErrorMessage(result.message)}`,
    );
    return;
  }

  logMessage(`Smoke Discord notification skipped by sender. reason=${result.reason}`);
}

// 寫入 Discord 通知去重 state；寫入失敗只記錄 log，不阻斷下一輪 smoke。
async function writeSmokeDiscordNotificationStateSafely({
  path,
  state,
  logMessage,
}: {
  path: string;
  state: Awaited<ReturnType<typeof readSmokeDiscordNotificationState>>;
  logMessage: (message: string) => void;
}): Promise<void> {
  if (!state) {
    return;
  }

  try {
    await writeSmokeDiscordNotificationState(path, state);
  } catch (error) {
    logMessage(
      `Smoke Discord notification state could not be written: ${toSafeCliErrorMessage(error)}`,
    );
  }
}

// 建立 SIGINT/SIGTERM shutdown controller，讓 daemon 可喚醒 sleep 並在目前檢查後停止。
function createShutdownController(): ShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;

  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      log(`Received ${signal}; stopping after the current smoke check.`);
    }

    stopRequested = true;
    wakeSleeper?.();
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  return {
    get requested() {
      return stopRequested;
    },
    sleep(ms: number) {
      return new Promise((resolve) => {
        if (stopRequested) {
          resolve();
          return;
        }

        const timeoutId = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeoutId);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}

// 透過 ops logger 輸出 daemon log，避免直接在流程中散落 console 呼叫。
function log(message: string): void {
  logger.info(message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
