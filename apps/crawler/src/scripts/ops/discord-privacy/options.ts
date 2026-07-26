// apps/crawler/src/scripts/ops/discord-privacy/options.ts
// 解析 Discord privacy 管理工具的 Goal 01 user / guild inspect 與 erase 參數。

import { DISCORD_SNOWFLAKE_PATTERN } from "../discord-bot/constants";

export type DiscordPrivacyCommand =
  | {
      action: "inspect-user" | "erase-user";
      subjectType: "user";
      subjectId: string;
      execute: boolean;
    }
  | {
      action: "inspect-guild" | "erase-guild";
      subjectType: "guild";
      subjectId: string;
      execute: boolean;
    };

export function parseDiscordPrivacyCommand(args: string[]): DiscordPrivacyCommand {
  const [action, ...options] = args;

  if (
    action !== "inspect-user" &&
    action !== "erase-user" &&
    action !== "inspect-guild" &&
    action !== "erase-guild"
  ) {
    throw new Error("A supported Discord privacy action is required.");
  }

  const subjectType = action.endsWith("user") ? "user" : "guild";
  const idFlag = subjectType === "user" ? "--discord-user-id" : "--discord-guild-id";
  const subjectId = readOption(options, idFlag);

  if (!subjectId || !DISCORD_SNOWFLAKE_PATTERN.test(subjectId)) {
    throw new Error(`${idFlag} must be a Discord snowflake id.`);
  }

  const execute = options.includes("--confirm-erase");
  const unknown = options.filter(
    (value, index) =>
      value !== idFlag && options[index - 1] !== idFlag && value !== "--confirm-erase",
  );

  if (unknown.length > 0) {
    throw new Error(`Unknown Discord privacy option: ${unknown[0]}`);
  }

  if (action.startsWith("inspect") && execute) {
    throw new Error("--confirm-erase is only valid for erase actions.");
  }

  return {
    action,
    subjectType,
    subjectId,
    execute,
  } as DiscordPrivacyCommand;
}

function readOption(args: string[], name: string): string | null {
  const index = args.indexOf(name);

  if (index < 0 || index === args.length - 1 || args[index + 1]?.startsWith("--")) {
    return null;
  }

  if (args.indexOf(name, index + 1) >= 0) {
    throw new Error(`${name} may only be provided once.`);
  }

  return args[index + 1] ?? null;
}

export function printDiscordPrivacyHelp(): void {
  console.log(`Usage:
  pnpm ops:discord-privacy -- inspect-user --discord-user-id <id>
  pnpm ops:discord-privacy -- erase-user --discord-user-id <id> [--confirm-erase]
  pnpm ops:discord-privacy -- inspect-guild --discord-guild-id <id>
  pnpm ops:discord-privacy -- erase-guild --discord-guild-id <id> [--confirm-erase]

Erase commands are dry-run unless --confirm-erase is supplied.`);
}
