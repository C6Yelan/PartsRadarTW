// apps/crawler/src/scripts/ops/discord-bot/daemon.ts
// 啟動 Discord bot daemon，協調 slash command 註冊、gateway session 與背景通知掃描。

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import { createOpsLogger } from "../shared/logger";
import { CommandCooldowns } from "./cooldowns";
import { createShutdownController, getWebSocketConstructor, runGatewaySession } from "./gateway";
import {
  calculateScheduledPriceReportSleepMs,
  readNextScheduledPriceReportDueAt,
  sendDueScheduledPriceReports,
} from "./price-report";
import { sendPendingPublicPriceReports } from "./public-price-report";
import { notifyPublicReportAccessDisabled } from "./public-price-report/access-alert";
import { registerDiscordBotCommands } from "./registration";
import {
  formatDiscordRestFailure,
  probeDiscordPublicReportAccess,
  sendDiscordChannelMessages,
  sendDiscordDirectMessages,
} from "./rest";
import {
  createDiscordBotSchedulerStatusStore,
  type DiscordBotSchedulerStatusStore,
} from "./scheduler-status";
import { sendDueTargetPriceNotifications } from "./target-price-notification";
import type {
  DiscordBotClient,
  DiscordBotOptions,
  FetchImpl,
  MinimalWebSocketConstructor,
  ShutdownController,
} from "./types";

const logger = createOpsLogger();
type PublicReportAccessDisabledCallback = NonNullable<
  Parameters<typeof sendPendingPublicPriceReports>[0]["onAccessDisabled"]
>;

// 執行 Discord bot 主程序；gateway 負責互動事件，notification loop 負責排程與目標價通知。
export async function runDiscordBotDaemon({
  client,
  options,
  fetchImpl = fetch,
  WebSocketCtor = getWebSocketConstructor(),
  logMessage = log,
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  fetchImpl?: FetchImpl;
  WebSocketCtor?: MinimalWebSocketConstructor;
  logMessage?: (message: string) => void;
}): Promise<void> {
  if (options.registerCommandsOnStart) {
    const result = await registerDiscordBotCommands({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      fetchImpl,
    });

    if (result.status !== "ok") {
      throw new Error(`Discord command registration failed: ${formatDiscordRestFailure(result)}`);
    }

    logMessage(`Discord bot commands registered. scope=global httpStatus=${result.httpStatus}`);
  }

  const shutdown = createShutdownController(logMessage);
  const cooldowns = new CommandCooldowns(options.commandCooldownSeconds);
  const schedulerStatus = createDiscordBotSchedulerStatusStore();
  const unavailableGuildIds = new Set<string>();
  const onPublicReportAccessDisabled: PublicReportAccessDisabledCallback = (event) =>
    notifyPublicReportAccessDisabled({
      webhookUrl: options.adminWebhookUrl,
      fetchImpl,
      logMessage,
      ...event,
    });
  logMessage(
    `Discord bot features. publicReports=${formatFeatureFlag(options.publicReportsEnabled)} personalReports=${formatFeatureFlag(options.personalReportsEnabled)} targetWatches=${formatFeatureFlag(options.targetWatchesEnabled)} registerCommandsOnStart=${formatFeatureFlag(options.registerCommandsOnStart)}`,
  );
  const notificationLoop = runNotificationLoop({
    client,
    options,
    shutdown,
    fetchImpl,
    logMessage,
    schedulerStatus,
    unavailableGuildIds,
    onPublicReportAccessDisabled,
  });

  logMessage("Discord bot daemon started.");

  while (!shutdown.requested) {
    await runGatewaySession({
      client,
      options,
      shutdown,
      cooldowns,
      fetchImpl,
      WebSocketCtor,
      logMessage,
      schedulerStatus,
      unavailableGuildIds,
      onPublicReportAccessDisabled,
    });

    if (!shutdown.requested) {
      logMessage("Discord gateway disconnected; reconnecting in 5s.");
      await shutdown.sleep(5000);
    }
  }

  await notificationLoop;
  logMessage("Discord bot daemon stopped.");
}

// 以可中止 sleep 跑背景通知迴圈，讓 shutdown 時能等待當前 cycle 結束。
async function runNotificationLoop({
  client,
  options,
  shutdown,
  fetchImpl,
  logMessage,
  schedulerStatus,
  unavailableGuildIds,
  onPublicReportAccessDisabled,
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  shutdown: ShutdownController;
  fetchImpl: FetchImpl;
  logMessage: (message: string) => void;
  schedulerStatus: DiscordBotSchedulerStatusStore;
  unavailableGuildIds: ReadonlySet<string>;
  onPublicReportAccessDisabled: PublicReportAccessDisabledCallback;
}): Promise<void> {
  const scanIntervalMs = options.priceReportScheduleIntervalSeconds * 1000;
  let nextTargetPriceScanAtMs = 0;

  while (!shutdown.requested) {
    const result = await runDiscordBotNotificationCycle({
      client,
      options,
      fetchImpl,
      logMessage,
      scanIntervalMs,
      nextTargetPriceScanAtMs,
      schedulerStatus,
      unavailableGuildIds,
      onPublicReportAccessDisabled,
      clock: () => new Date(),
    });
    nextTargetPriceScanAtMs = result.nextTargetPriceScanAtMs;

    await shutdown.sleep(result.nextSleepMs);
  }
}

// 執行單輪背景通知掃描，依 feature flag 分別處理目標價、公開報告與個人排程報告。
export async function runDiscordBotNotificationCycle({
  client,
  options,
  fetchImpl,
  logMessage,
  scanIntervalMs,
  nextTargetPriceScanAtMs,
  now = new Date(),
  schedulerStatus,
  unavailableGuildIds,
  onPublicReportAccessDisabled,
  clock = () => now,
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  logMessage: (message: string) => void;
  scanIntervalMs: number;
  nextTargetPriceScanAtMs: number;
  now?: Date;
  schedulerStatus?: DiscordBotSchedulerStatusStore;
  unavailableGuildIds?: ReadonlySet<string>;
  onPublicReportAccessDisabled?: PublicReportAccessDisabledCallback;
  clock?: () => Date;
}): Promise<{ nextSleepMs: number; nextTargetPriceScanAtMs: number }> {
  const cycleStartedAt = now;
  let nextSleepMs = scanIntervalMs;
  let nextTargetScanAt = nextTargetPriceScanAtMs;
  let cycleFailed = false;
  let globalDiscordUnavailable = false;

  if (options.targetWatchesEnabled && now.getTime() >= nextTargetScanAt) {
    const startedAt = clock();
    try {
      const summary = await sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: options.publicBaseUrl,
        now,
        sendDirectMessages: (discordUserId, messages) =>
          sendDiscordDirectMessages({
            token: options.token,
            apiBaseUrl: options.apiBaseUrl,
            userId: discordUserId,
            messages,
            fetchImpl,
          }),
      });

      if (summary.processedCount > 0) {
        logMessage(
          `Target price notifications processed. processed=${summary.processedCount} sent=${summary.sentCount} rateLimited=${summary.rateLimitedCount} failed=${summary.failedCount}`,
        );
      }

      const completedAt = clock();
      schedulerStatus?.recordTargetPrice({
        startedAt,
        completedAt,
        outcome: "OK",
        nextRunAt: new Date(now.getTime() + scanIntervalMs),
        ...summary,
      });
    } catch (error) {
      cycleFailed = true;
      logMessage(`Target price notification scan failed: ${toSafeCliErrorMessage(error)}`);
      schedulerStatus?.recordTargetPrice({
        startedAt,
        completedAt: clock(),
        outcome: "ERROR",
        nextRunAt: new Date(now.getTime() + scanIntervalMs),
        errorKind: "SCAN_ERROR",
        scannedCount: 0,
        dueCount: 0,
        processedCount: 0,
        sentCount: 0,
        rateLimitedCount: 0,
        failedCount: 0,
      });
    } finally {
      nextTargetScanAt = now.getTime() + scanIntervalMs;
    }
  }

  if (options.publicReportsEnabled) {
    const startedAt = clock();
    try {
      if (!onPublicReportAccessDisabled) {
        throw new Error("Public report access-disabled callback is required.");
      }

      const publicSummary = await sendPendingPublicPriceReports({
        client,
        options,
        now,
        sendChannelMessages: (channelId, messages) =>
          sendDiscordChannelMessages({
            token: options.token,
            apiBaseUrl: options.apiBaseUrl,
            channelId,
            messages,
            fetchImpl,
          }),
        probeAccess: (setting) =>
          probeDiscordPublicReportAccess({
            token: options.token,
            apiBaseUrl: options.apiBaseUrl,
            guildId: setting.discordGuildId,
            channelId: setting.channelId,
            fetchImpl,
          }),
        unavailableGuildIds,
        onAccessDisabled: onPublicReportAccessDisabled,
      });

      if (publicSummary.processedCount > 0) {
        logMessage(
          `Public price reports processed. settings=${publicSummary.settingCount} processed=${publicSummary.processedCount} sent=${publicSummary.sentCount} skipped=${publicSummary.skippedCount} rateLimited=${publicSummary.rateLimitedCount} failed=${publicSummary.failedCount}`,
        );
      }

      schedulerStatus?.recordPublicReports({
        startedAt,
        completedAt: clock(),
        outcome: "OK",
        ...publicSummary,
      });
      if (publicSummary.retryNotBefore) {
        nextSleepMs = Math.min(
          nextSleepMs,
          Math.max(1000, publicSummary.retryNotBefore.getTime() - now.getTime()),
        );
      }
      globalDiscordUnavailable =
        publicSummary.globalRateLimited || publicSummary.globalAuthFailed;
    } catch (error) {
      cycleFailed = true;
      logMessage(`Public price report scan failed: ${toSafeCliErrorMessage(error)}`);
      schedulerStatus?.recordPublicReports({
        startedAt,
        completedAt: clock(),
        outcome: "ERROR",
        errorKind: "SCAN_ERROR",
        settingCount: 0,
        processedCount: 0,
        sentCount: 0,
        skippedCount: 0,
        rateLimitedCount: 0,
        failedCount: 0,
      });
    }
  }

  if (options.personalReportsEnabled && !globalDiscordUnavailable) {
    const startedAt = clock();
    try {
      const summary = await sendDueScheduledPriceReports({
        client,
        options,
        now,
        sendDirectMessages: (discordUserId, messages) =>
          sendDiscordDirectMessages({
            token: options.token,
            apiBaseUrl: options.apiBaseUrl,
            userId: discordUserId,
            messages,
            fetchImpl,
          }),
      });

      if (summary.processedCount > 0) {
        logMessage(
          `Scheduled price reports processed. processed=${summary.processedCount} sent=${summary.sentCount} rateLimited=${summary.rateLimitedCount} failed=${summary.failedCount}`,
        );
      }

      const nextDueAt = await readNextScheduledPriceReportDueAt({ client });
      nextSleepMs = calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt,
        maxSleepMs: nextSleepMs,
      });
      schedulerStatus?.recordPersonalReports({
        startedAt,
        completedAt: clock(),
        outcome: "OK",
        nextRunAt: nextDueAt,
        ...summary,
      });
    } catch (error) {
      cycleFailed = true;
      logMessage(`Scheduled price report scan failed: ${toSafeCliErrorMessage(error)}`);
      schedulerStatus?.recordPersonalReports({
        startedAt,
        completedAt: clock(),
        outcome: "ERROR",
        errorKind: "SCAN_ERROR",
        processedCount: 0,
        sentCount: 0,
        rateLimitedCount: 0,
        failedCount: 0,
      });
    }
  }

  if (options.targetWatchesEnabled) {
    nextSleepMs = Math.min(nextSleepMs, Math.max(1000, nextTargetScanAt - now.getTime()));
  }

  const cycleCompletedAt = clock();
  schedulerStatus?.recordNotificationLoop({
    startedAt: cycleStartedAt,
    completedAt: cycleCompletedAt,
    outcome: cycleFailed ? "ERROR" : "OK",
    nextRunAt: new Date(cycleCompletedAt.getTime() + nextSleepMs),
    errorKind: cycleFailed ? "CHILD_SCHEDULE_ERROR" : null,
  });

  return {
    nextSleepMs,
    nextTargetPriceScanAtMs: nextTargetScanAt,
  };
}

function formatFeatureFlag(enabled: boolean): "enabled" | "disabled" {
  return enabled ? "enabled" : "disabled";
}

function log(message: string): void {
  logger.info(message);
}
