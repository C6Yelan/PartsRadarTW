// apps/crawler/src/scripts/ops/discord-privacy/options.ts
// 解析 Discord privacy 管理工具參數；user inspect / erase 只接受已驗證 request ID。

import { DISCORD_SNOWFLAKE_PATTERN } from "../discord-bot/constants";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DiscordPrivacyCommand =
  | {
      action: "create-verification";
      requestType: "INSPECT" | "ERASE";
      subjectId: string;
    }
  | {
      action:
        | "verify-code"
        | "cancel-verification"
        | "show-verification-status"
        | "inspect-user"
        | "erase-user";
      requestId: string;
      execute: boolean;
    }
  | {
      action: "inspect-guild" | "erase-guild";
      subjectId: string;
      execute: boolean;
    }
  | {
      action: "cleanup";
      execute: boolean;
    };

export function parseDiscordPrivacyCommand(args: string[]): DiscordPrivacyCommand {
  const [action, ...options] = args;

  if (action === "create-verification") {
    const subjectId = requireSnowflake(options, "--discord-user-id");
    const requestTypeText = requireOption(options, "--request-type").toLowerCase();
    const requestType =
      requestTypeText === "inspect" ? "INSPECT" : requestTypeText === "erase" ? "ERASE" : null;

    if (!requestType) {
      throw new Error("--request-type must be inspect or erase.");
    }
    assertNoUnknownOptions(options, ["--discord-user-id", "--request-type"]);
    return { action, requestType, subjectId };
  }

  if (
    action === "verify-code" ||
    action === "cancel-verification" ||
    action === "show-verification-status" ||
    action === "inspect-user" ||
    action === "erase-user"
  ) {
    const requestId = requireUuid(options, "--request-id");
    const execute = options.includes("--confirm-erase");
    assertNoUnknownOptions(options, ["--request-id", "--confirm-erase"]);

    if (action !== "erase-user" && execute) {
      throw new Error("--confirm-erase is only valid for erase-user.");
    }
    return { action, requestId, execute };
  }

  if (action === "inspect-guild" || action === "erase-guild") {
    const subjectId = requireSnowflake(options, "--discord-guild-id");
    const execute = options.includes("--confirm-erase");
    assertNoUnknownOptions(options, ["--discord-guild-id", "--confirm-erase"]);

    if (action === "inspect-guild" && execute) {
      throw new Error("--confirm-erase is only valid for erase-guild.");
    }
    return { action, subjectId, execute };
  }

  if (action === "cleanup") {
    const execute = options.includes("--confirm-cleanup");
    assertNoUnknownOptions(options, ["--confirm-cleanup"]);
    return { action, execute };
  }

  throw new Error("A supported Discord privacy action is required.");
}

function requireSnowflake(args: string[], name: string): string {
  const value = requireOption(args, name);

  if (!DISCORD_SNOWFLAKE_PATTERN.test(value)) {
    throw new Error(`${name} must be a Discord snowflake id.`);
  }

  return value;
}

function requireUuid(args: string[], name: string): string {
  const value = requireOption(args, name);

  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }

  return value;
}

function requireOption(args: string[], name: string): string {
  const index = args.indexOf(name);

  if (index < 0 || index === args.length - 1 || args[index + 1]?.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }
  if (args.indexOf(name, index + 1) >= 0) {
    throw new Error(`${name} may only be provided once.`);
  }

  return args[index + 1] as string;
}

function assertNoUnknownOptions(args: string[], valueOptions: string[]): void {
  const acceptedFlags = new Set(["--confirm-erase", "--confirm-cleanup"]);

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index] as string;

    if (valueOptions.includes(value) && !acceptedFlags.has(value)) {
      index += 1;
      continue;
    }
    if (acceptedFlags.has(value)) {
      continue;
    }
    throw new Error(`Unknown Discord privacy option: ${value}`);
  }
}

export function printDiscordPrivacyHelp(): void {
  console.log(`Usage:
  pnpm ops:discord-privacy -- create-verification --request-type <inspect|erase> --discord-user-id <id>
  pnpm ops:discord-privacy -- verify-code --request-id <uuid> < code.txt
  pnpm ops:discord-privacy -- cancel-verification --request-id <uuid>
  pnpm ops:discord-privacy -- show-verification-status --request-id <uuid>
  pnpm ops:discord-privacy -- inspect-user --request-id <verified-uuid>
  pnpm ops:discord-privacy -- erase-user --request-id <verified-uuid> [--confirm-erase]
  pnpm ops:discord-privacy -- inspect-guild --discord-guild-id <id>
  pnpm ops:discord-privacy -- erase-guild --discord-guild-id <id> [--confirm-erase]
  pnpm ops:discord-privacy -- cleanup [--confirm-cleanup]

Erase and cleanup commands are dry-run unless their explicit confirmation flag is supplied.
Verification codes are read from stdin and are never accepted as CLI arguments.`);
}
