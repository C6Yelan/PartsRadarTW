// apps/crawler/src/scripts/ops/discord-bot.ts
// Discord bot CLI entrypoint，負責載入設定、處理一次性 slash command 註冊或啟動 daemon。

import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { runDiscordBotDaemon } from "./discord-bot/daemon";
import { parseDiscordBotOptions, printDiscordBotHelp } from "./discord-bot/options";
import { registerDiscordBotCommands } from "./discord-bot/registration";
import { formatDiscordRestFailure } from "./discord-bot/rest";
import { createOpsLogger } from "./shared/logger";

const logger = createOpsLogger();

// 透過 ops logger 輸出 Discord bot entrypoint 訊息，讓格式與其他 daemon 一致。
function log(message: string): void {
  logger.info(message);
}

// 載入工作區 env 與 Discord bot options，依 CLI 參數執行 command registration 或 daemon runtime。
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const registerCommands = args.includes("--register-commands");

  if (args.includes("--help")) {
    printDiscordBotHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseDiscordBotOptions(args);

  if (registerCommands) {
    // 一次性註冊 slash commands 後結束，不啟動 gateway 或背景通知 loop。
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
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
