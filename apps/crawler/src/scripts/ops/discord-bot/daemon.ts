// apps/crawler/src/scripts/ops/discord-bot/daemon.ts

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import { CommandCooldowns } from "./cooldowns";
import { createShutdownController, getWebSocketConstructor, runGatewaySession } from "./gateway";
import { sendDueScheduledPriceReports } from "./price-report";
import { registerDiscordBotCommands } from "./registration";
import { formatDiscordRestFailure, sendDiscordDirectMessages } from "./rest";
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
      guildId: options.guildId,
      apiBaseUrl: options.apiBaseUrl,
      fetchImpl,
    });

    if (result.status !== "ok") {
      throw new Error(`Discord command registration failed: ${formatDiscordRestFailure(result)}`);
    }

    logMessage(
      `Discord bot commands registered. scope=global guildCommands=${result.clearedGuildCommands ? "cleared" : "none"} httpStatus=${result.httpStatus}`,
    );

    if (options.registerCommands) {
      return;
    }
  }

  const shutdown = createShutdownController(logMessage);
  const cooldowns = new CommandCooldowns(options.commandCooldownSeconds);
  const scheduledReportLoop = runScheduledPriceReportLoop({
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

  await scheduledReportLoop;
  logMessage("Discord bot daemon stopped.");
}

async function runScheduledPriceReportLoop({
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
  while (!shutdown.requested) {
    try {
      const summary = await sendDueScheduledPriceReports({
        client,
        options,
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
    } catch (error) {
      logMessage(`Scheduled price report loop failed: ${toSafeCliErrorMessage(error)}`);
    }

    await shutdown.sleep(options.priceReportScheduleIntervalSeconds * 1000);
  }
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}
