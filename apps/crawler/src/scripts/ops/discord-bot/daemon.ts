// apps/crawler/src/scripts/ops/discord-bot/daemon.ts

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import { CommandCooldowns } from "./cooldowns";
import { createShutdownController, getWebSocketConstructor, runGatewaySession } from "./gateway";
import {
  calculateScheduledPriceReportSleepMs,
  readNextScheduledPriceReportDueAt,
  sendDueScheduledPriceReports,
} from "./price-report";
import { sendPendingPublicPriceReports } from "./public-price-report";
import { registerDiscordBotCommands } from "./registration";
import {
  formatDiscordRestFailure,
  sendDiscordChannelMessages,
  sendDiscordDirectMessages,
} from "./rest";
import { sendDueTargetPriceNotifications } from "./target-price-notification";
import type {
  DiscordBotClient,
  DiscordBotOptions,
  FetchImpl,
  MinimalWebSocketConstructor,
  ShutdownController,
} from "./types";
import { createOpsLogger } from "../shared/logger";

const logger = createOpsLogger();

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
  if (options.registerCommands || options.registerCommandsOnStart) {
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

    if (options.registerCommands) {
      return;
    }
  }

  const shutdown = createShutdownController(logMessage);
  const cooldowns = new CommandCooldowns(options.commandCooldownSeconds);
  logMessage(
    `Discord bot features. publicReports=${formatFeatureFlag(options.publicReportsEnabled)} personalReports=${formatFeatureFlag(options.personalReportsEnabled)} targetWatches=${formatFeatureFlag(options.targetWatchesEnabled)} registerCommandsOnStart=${formatFeatureFlag(options.registerCommandsOnStart)}`,
  );
  const notificationLoop = runNotificationLoop({
    client,
    options,
    shutdown,
    fetchImpl,
    logMessage,
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
    });

    if (!shutdown.requested) {
      logMessage("Discord gateway disconnected; reconnecting in 5s.");
      await shutdown.sleep(5000);
    }
  }

  await notificationLoop;
  logMessage("Discord bot daemon stopped.");
}

async function runNotificationLoop({
  client,
  options,
  shutdown,
  fetchImpl,
  logMessage,
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  shutdown: ShutdownController;
  fetchImpl: FetchImpl;
  logMessage: (message: string) => void;
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
    });
    nextTargetPriceScanAtMs = result.nextTargetPriceScanAtMs;

    await shutdown.sleep(result.nextSleepMs);
  }
}

export async function runDiscordBotNotificationCycle({
  client,
  options,
  fetchImpl,
  logMessage,
  scanIntervalMs,
  nextTargetPriceScanAtMs,
  now = new Date(),
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  logMessage: (message: string) => void;
  scanIntervalMs: number;
  nextTargetPriceScanAtMs: number;
  now?: Date;
}): Promise<{ nextSleepMs: number; nextTargetPriceScanAtMs: number }> {
  let nextSleepMs = scanIntervalMs;
  let nextTargetScanAt = nextTargetPriceScanAtMs;

  if (options.targetWatchesEnabled && now.getTime() >= nextTargetScanAt) {
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
    } catch (error) {
      logMessage(`Target price notification scan failed: ${toSafeCliErrorMessage(error)}`);
    } finally {
      nextTargetScanAt = now.getTime() + scanIntervalMs;
    }
  }

  try {
    if (options.publicReportsEnabled) {
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
      });

      if (publicSummary.processedCount > 0) {
        logMessage(
          `Public price reports processed. settings=${publicSummary.settingCount} processed=${publicSummary.processedCount} sent=${publicSummary.sentCount} skipped=${publicSummary.skippedCount} rateLimited=${publicSummary.rateLimitedCount} failed=${publicSummary.failedCount}`,
        );
      }
    }

    if (options.personalReportsEnabled) {
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

      nextSleepMs = calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: await readNextScheduledPriceReportDueAt({ client }),
        maxSleepMs: nextSleepMs,
      });
    }
  } catch (error) {
    logMessage(`Scheduled price report loop failed: ${toSafeCliErrorMessage(error)}`);
  }

  if (options.targetWatchesEnabled) {
    nextSleepMs = Math.min(nextSleepMs, Math.max(1000, nextTargetScanAt - now.getTime()));
  }

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
