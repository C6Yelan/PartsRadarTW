// apps/crawler/src/scripts/ops/discord-bot.ts
import { loadWorkspaceEnv, resolveWorkspaceRoot } from "../shared/script-utils";
import { runDiscordBotDaemon } from "./discord-bot/daemon";
import { parseDiscordBotOptions, printDiscordBotHelp } from "./discord-bot/options";
import { registerDiscordBotCommands } from "./discord-bot/registration";
import { formatDiscordRestFailure } from "./discord-bot/rest";

export { createPriceReportCommand, parsePriceReportInteraction } from "./discord-bot/commands";
export { CommandCooldowns } from "./discord-bot/cooldowns";
export { runDiscordBotDaemon } from "./discord-bot/daemon";
export { runGatewaySession } from "./discord-bot/gateway";
export { handleDiscordInteraction } from "./discord-bot/interactions";
export { parseDiscordBotOptions, printDiscordBotHelp } from "./discord-bot/options";
export {
  disablePriceReport,
  enableDailyPriceReport,
  formatPriceReportSettingMessage,
  formatTaipeiMinute,
  formatWindowLabel,
  readPriceReportSetting,
  sendDueScheduledPriceReports,
  sendPriceReportNow,
} from "./discord-bot/price-report";
export { registerDiscordBotCommands } from "./discord-bot/registration";
export {
  deferInteractionResponse,
  formatDiscordBotText,
  formatDiscordRestFailure,
  sendDiscordDirectMessages,
  sendDiscordInteractionMessages,
  sendDiscordRestRequest,
  sendInteractionResponse,
} from "./discord-bot/rest";
export type { ScheduledPriceReportSummary } from "./discord-bot/price-report";
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
} from "./discord-bot/types";

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

    log(
      `Discord bot commands registered. scope=${options.guildId ? "global+guild" : "global"} httpStatus=${result.httpStatus}`,
    );
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
