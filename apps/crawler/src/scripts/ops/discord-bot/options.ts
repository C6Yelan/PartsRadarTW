// apps/crawler/src/scripts/ops/discord-bot/options.ts

import { normalizePublicBaseUrl } from "../price-change-discord-notification";
import { getStringArg } from "../../shared/script-utils";
import {
  DEFAULT_COMMAND_COOLDOWN_SECONDS,
  DEFAULT_DISCORD_API_BASE_URL,
  DEFAULT_DISCORD_GATEWAY_URL,
  DEFAULT_PRICE_REPORT_MAX_ITEMS,
  DEFAULT_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS,
  DEFAULT_PUBLIC_BASE_URL,
  DISCORD_SNOWFLAKE_PATTERN,
  MAX_PRICE_REPORT_ITEMS,
} from "./constants";
import type { DiscordBotOptions } from "./types";

export function parseDiscordBotOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): DiscordBotOptions {
  return {
    token: readRequiredSecret(env, "DISCORD_BOT_TOKEN"),
    applicationId: readRequiredSnowflake(env, "DISCORD_APPLICATION_ID"),
    publicBaseUrl: normalizePublicBaseUrl(
      env.PARTSRADAR_PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL,
    ),
    apiBaseUrl: normalizeHttpBaseUrl(
      env.DISCORD_API_BASE_URL ?? DEFAULT_DISCORD_API_BASE_URL,
      "DISCORD_API_BASE_URL",
    ),
    gatewayUrl: normalizeWebSocketUrl(
      env.DISCORD_GATEWAY_URL ?? DEFAULT_DISCORD_GATEWAY_URL,
      "DISCORD_GATEWAY_URL",
    ),
    registerCommands: args.includes("--register-commands"),
    registerCommandsOnStart: readBooleanEnv(env, "DISCORD_BOT_REGISTER_COMMANDS_ON_START", true),
    priceReportMaxItems: parseIntegerOption({
      args,
      env,
      argName: "--price-report-max-items",
      envName: "DISCORD_PRICE_REPORT_MAX_ITEMS",
      fallback: DEFAULT_PRICE_REPORT_MAX_ITEMS,
      min: 1,
      max: MAX_PRICE_REPORT_ITEMS,
    }),
    commandCooldownSeconds: parseIntegerOption({
      args,
      env,
      argName: "--command-cooldown-seconds",
      envName: "DISCORD_BOT_COMMAND_COOLDOWN_SECONDS",
      fallback: DEFAULT_COMMAND_COOLDOWN_SECONDS,
      min: 0,
      max: 3600,
    }),
    priceReportScheduleIntervalSeconds: parseIntegerOption({
      args,
      env,
      argName: "--price-report-schedule-interval-seconds",
      envName: "DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS",
      fallback: DEFAULT_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS,
      min: 60,
      max: 3600,
    }),
  };
}

function readRequiredSecret(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();

  if (!value || value.startsWith("replace_with_")) {
    throw new Error(`${key} is required for Discord bot commands.`);
  }

  return value;
}

function readRequiredSnowflake(env: NodeJS.ProcessEnv, key: string): string {
  const value = readRequiredSecret(env, key);

  if (!DISCORD_SNOWFLAKE_PATTERN.test(value)) {
    throw new Error(`${key} must be a Discord snowflake id.`);
  }

  return value;
}

function readBooleanEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const value = env[key]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (value === "true" || value === "1" || value === "yes") {
    return true;
  }

  if (value === "false" || value === "0" || value === "no") {
    return false;
  }

  throw new Error(`${key} must be true or false.`);
}

function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = getStringArg(args, argName) ?? env[envName] ?? String(fallback);
  const message = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}

function normalizeHttpBaseUrl(value: string, label: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");

  return url.toString();
}

function normalizeWebSocketUrl(value: string, label: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid ws(s) URL.`);
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`${label} must be a valid ws(s) URL.`);
  }

  url.hash = "";

  return url.toString();
}

export function printDiscordBotHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:discord-bot -- [options]

Options:
  --register-commands         Register slash commands and exit.
  --price-report-max-items <n>
                              Maximum rows in price report messages.
                              Default: ${DEFAULT_PRICE_REPORT_MAX_ITEMS}, range: 1-${MAX_PRICE_REPORT_ITEMS}
  --command-cooldown-seconds <sec>
                              Per-user cooldown for bot commands.
                              Default: ${DEFAULT_COMMAND_COOLDOWN_SECONDS}, range: 0-3600
  --price-report-schedule-interval-seconds <sec>
                              Maximum fallback delay between scheduled price report scans.
                              Default: ${DEFAULT_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS}, range: 60-3600

Environment:
  DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_BOT_REGISTER_COMMANDS_ON_START,
  DISCORD_PRICE_REPORT_MAX_ITEMS,
  DISCORD_BOT_COMMAND_COOLDOWN_SECONDS, DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS,
  PARTSRADAR_PUBLIC_BASE_URL
`);
}
