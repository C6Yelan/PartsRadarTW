// apps/crawler/src/scripts/ops/discord-bot.ts
import { loadWorkspaceEnv, resolveWorkspaceRoot } from "../shared/script-utils";
import { runDiscordBotDaemon } from "./discord-bot/daemon";
import { parseDiscordBotOptions, printDiscordBotHelp } from "./discord-bot/options";
import { registerDiscordBotCommands } from "./discord-bot/registration";
import { formatDiscordRestFailure } from "./discord-bot/rest";

export {
  createBotCommand,
  createPriceReportCommand,
  createPublicReportCommand,
  createWatchCommand,
  parseBotInteraction,
  parsePriceReportInteraction,
  parsePublicReportInteraction,
  parseWatchInteraction,
} from "./discord-bot/commands";
export { CommandCooldowns } from "./discord-bot/cooldowns";
export { runDiscordBotDaemon } from "./discord-bot/daemon";
export { runGatewaySession } from "./discord-bot/gateway";
export { handleDiscordInteraction } from "./discord-bot/interactions";
export { parseDiscordBotOptions, printDiscordBotHelp } from "./discord-bot/options";
export type { ScheduledPriceReportSummary } from "./discord-bot/price-report";
export {
  calculateScheduledPriceReportSleepMs,
  createPublicPriceChangeReportMessages,
  createPublicPriceReportMessages,
  disablePriceReport,
  enableDailyPriceReport,
  formatPriceReportSettingMessage,
  formatTaipeiMinute,
  formatWindowLabel,
  readNextScheduledPriceReportDueAt,
  readPriceReportSetting,
  sendDueScheduledPriceReports,
  sendPriceReportNow,
} from "./discord-bot/price-report";
export type {
  PublicPriceReportDeliveryStatus,
  PublicPriceReportPreviewResult,
  PublicPriceReportSetting,
  PublicPriceReportSummary,
} from "./discord-bot/public-price-report";
export {
  clearPublicPriceReportSetting,
  readLatestPublicPriceReportDelivery,
  readPublicPriceReportSetting,
  sendPendingPublicPriceReports,
  sendPublicPriceReportPreview,
  setPublicPriceReportChannel,
  setPublicPriceReportEnabled,
} from "./discord-bot/public-price-report";
export { registerDiscordBotCommands } from "./discord-bot/registration";
export {
  deferInteractionMessageUpdate,
  deferInteractionResponse,
  formatDiscordBotText,
  formatDiscordRestFailure,
  sendDiscordChannelMessages,
  sendDiscordDirectMessages,
  sendDiscordInteractionMessages,
  sendDiscordRestRequest,
  sendInteractionResponse,
} from "./discord-bot/rest";
export type { TargetPriceNotificationSummary } from "./discord-bot/target-price-notification";
export {
  createTargetPriceReachedMessage,
  sendDueTargetPriceNotifications,
} from "./discord-bot/target-price-notification";
export type {
  DiscordBotClient,
  DiscordBotEmbed,
  DiscordBotEmbedField,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordBotOptions,
  DiscordDirectMessageSendResult,
  DiscordInteraction,
  DiscordRestResult,
  FetchImpl,
  PriceReportNowResult,
  PriceReportTimeOfDay,
} from "./discord-bot/types";
export {
  createTargetPriceWatch,
  disableTargetPriceWatch,
  normalizeWatchProductReference,
  readTargetPriceWatchlist,
} from "./discord-bot/watch";

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printDiscordBotHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseDiscordBotOptions(args);

  if (options.registerCommands) {
    const result = await registerDiscordBotCommands(options);

    if (result.status !== "ok") {
      throw new Error(`Discord command registration failed: ${formatDiscordRestFailure(result)}`);
    }

    log(`Discord bot commands registered. scope=global httpStatus=${result.httpStatus}`);
    return;
  }

  const db = await import("@partsradar/db");
  const client = db.prisma;

  try {
    await runDiscordBotDaemon({
      client,
      options,
    });
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
