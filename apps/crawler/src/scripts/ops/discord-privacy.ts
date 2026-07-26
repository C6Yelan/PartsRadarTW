// apps/crawler/src/scripts/ops/discord-privacy.ts
// Discord privacy 管理 CLI；預設只盤點，明確 confirmation 才執行 hard delete。

import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { parseDiscordPrivacyCommand, printDiscordPrivacyHelp } from "./discord-privacy/options";
import { runDiscordPrivacyCommand } from "./discord-privacy/runner";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printDiscordPrivacyHelp();
    return;
  }

  const command = parseDiscordPrivacyCommand(args);
  await loadWorkspaceEnv(resolveWorkspaceRoot());
  const { prisma } = await import("@partsradar/db");

  try {
    const result = await runDiscordPrivacyCommand({ client: prisma, command });
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
