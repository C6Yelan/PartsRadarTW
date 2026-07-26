// apps/crawler/src/scripts/ops/discord-privacy.ts
// Discord privacy 管理 CLI；預設只盤點，明確 confirmation 才執行 hard delete。

import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { DEFAULT_DISCORD_API_BASE_URL } from "./discord-bot/constants";
import { sendDiscordDirectMessages } from "./discord-bot/rest";
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
  const code = command.action === "verify-code" ? await readVerificationCodeFromStdin() : undefined;

  try {
    const result = await runDiscordPrivacyCommand({
      client: prisma,
      command,
      code,
      sendVerificationDm:
        command.action === "create-verification"
          ? (discordUserId, messages) => {
              const transport = readPrivacyDmTransportOptions(process.env);
              return sendDiscordDirectMessages({
                ...transport,
                userId: discordUserId,
                messages,
              });
            }
          : undefined,
    });
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

async function readVerificationCodeFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

function readPrivacyDmTransportOptions(env: NodeJS.ProcessEnv): {
  token: string;
  apiBaseUrl: string;
} {
  const token = env.DISCORD_BOT_TOKEN?.trim();
  const apiBaseUrl = (env.DISCORD_API_BASE_URL ?? DEFAULT_DISCORD_API_BASE_URL).replace(/\/+$/, "");

  if (!token || token.startsWith("replace_with_")) {
    throw new Error("DISCORD_BOT_TOKEN is required to create a privacy verification.");
  }

  const url = new URL(apiBaseUrl);
  if (
    env.NODE_ENV === "production" &&
    (url.origin !== "https://discord.com" ||
      url.username ||
      url.password ||
      !url.pathname.startsWith("/api/"))
  ) {
    throw new Error("DISCORD_API_BASE_URL must use the official Discord HTTPS API in production.");
  }

  return { token, apiBaseUrl };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
