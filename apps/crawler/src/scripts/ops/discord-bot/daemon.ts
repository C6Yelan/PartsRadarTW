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
    let nextSleepMs = scanIntervalMs;
    const scanNow = new Date();

    if (scanNow.getTime() >= nextTargetPriceScanAtMs) {
      try {
        const summary = await sendDueTargetPriceNotifications({
          client,
          publicBaseUrl: options.publicBaseUrl,
          now: scanNow,
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
        nextTargetPriceScanAtMs = Date.now() + scanIntervalMs;
      }
    }

    try {
      const now = new Date();
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
          `Public price reports processed. processed=${publicSummary.processedCount} sent=${publicSummary.sentCount} skipped=${publicSummary.skippedCount} rateLimited=${publicSummary.rateLimitedCount} failed=${publicSummary.failedCount}`,
        );
      }

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
        now: new Date(),
        nextDueAt: await readNextScheduledPriceReportDueAt({ client }),
        maxSleepMs: nextSleepMs,
      });
    } catch (error) {
      logMessage(`Scheduled price report loop failed: ${toSafeCliErrorMessage(error)}`);
    }

    nextSleepMs = Math.min(nextSleepMs, Math.max(1000, nextTargetPriceScanAtMs - Date.now()));

    await shutdown.sleep(nextSleepMs);
  }
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}
