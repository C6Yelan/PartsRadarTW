// apps/crawler/src/scripts/ops/discord-bot.ts
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
} from "../shared/script-utils";
import { formatDiscordBotCliError } from "./discord-bot/cli-error";
import { runDiscordBotDaemon } from "./discord-bot/daemon";
import { parseDiscordBotOptions, printDiscordBotHelp } from "./discord-bot/options";
import { registerDiscordBotCommands } from "./discord-bot/registration";
import { formatDiscordRestFailure } from "./discord-bot/rest";
import { createOpsLogger } from "./shared/logger";

const logger = createOpsLogger();

function log(message: string): void {
  logger.info(message);
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
    console.error(formatDiscordBotCliError(error));
    process.exitCode = 1;
  });
}
