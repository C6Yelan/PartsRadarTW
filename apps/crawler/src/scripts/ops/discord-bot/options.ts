// apps/crawler/src/scripts/ops/discord-bot/options.ts
// 解析 Discord bot CLI/env 設定，包含 token、API 端點、功能旗標與排程參數。

import { parseBoundedIntegerOption } from "../../shared/script-utils";
import { readDiscordWebhookUrl } from "../discord-webhook";
import {
  DEFAULT_COMMAND_COOLDOWN_SECONDS,
  DEFAULT_DISCORD_API_BASE_URL,
  DEFAULT_DISCORD_GATEWAY_URL,
  DEFAULT_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS,
  DEFAULT_PUBLIC_BASE_URL,
  DISCORD_SNOWFLAKE_PATTERN,
} from "./constants";
import type { DiscordBotOptions } from "./types";

// 建立 Discord bot runtime options；CLI 只覆寫少數維運參數，其餘以 env/default 為主。
export function parseDiscordBotOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): DiscordBotOptions {
  const apiBaseUrl = normalizeHttpBaseUrl(
    env.DISCORD_API_BASE_URL ?? DEFAULT_DISCORD_API_BASE_URL,
    "DISCORD_API_BASE_URL",
  );
  const gatewayUrl = normalizeWebSocketUrl(
    env.DISCORD_GATEWAY_URL ?? DEFAULT_DISCORD_GATEWAY_URL,
    "DISCORD_GATEWAY_URL",
  );

  if (env.NODE_ENV === "production") {
    const apiUrl = new URL(apiBaseUrl);
    const gateway = new URL(gatewayUrl);

    if (
      apiUrl.origin !== "https://discord.com" ||
      apiUrl.username ||
      apiUrl.password ||
      !apiUrl.pathname.startsWith("/api/")
    ) {
      throw new Error(
        "DISCORD_API_BASE_URL must use the official Discord HTTPS API in production.",
      );
    }

    if (gateway.origin !== "wss://gateway.discord.gg" || gateway.username || gateway.password) {
      throw new Error(
        "DISCORD_GATEWAY_URL must use the official Discord WSS gateway in production.",
      );
    }
  }

  return {
    token: readRequiredSecret(env, "DISCORD_BOT_TOKEN"),
    applicationId: readRequiredSnowflake(env, "DISCORD_APPLICATION_ID"),
    publicBaseUrl: normalizeHttpBaseUrl(
      (env.PARTSRADAR_PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL).trim(),
      "PARTSRADAR_PUBLIC_BASE_URL",
    ),
    apiBaseUrl,
    gatewayUrl,
    adminWebhookUrl: readDiscordWebhookUrl(env, "DISCORD_ADMIN_WEBHOOK_URL"),
    registerCommandsOnStart: readBooleanEnv(env, "DISCORD_BOT_REGISTER_COMMANDS_ON_START", true),
    publicReportsEnabled: readBooleanEnv(env, "DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED", true),
    personalReportsEnabled: readBooleanEnv(env, "DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED", true),
    targetWatchesEnabled: readBooleanEnv(env, "DISCORD_FEATURE_TARGET_WATCHES_ENABLED", true),
    commandCooldownSeconds: parseBoundedIntegerOption({
      args,
      env,
      argName: "--command-cooldown-seconds",
      envName: "DISCORD_BOT_COMMAND_COOLDOWN_SECONDS",
      fallback: DEFAULT_COMMAND_COOLDOWN_SECONDS,
      min: 0,
      max: 3600,
    }),
    priceReportScheduleIntervalSeconds: parseBoundedIntegerOption({
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

// 讀取必要 secret/env；placeholder 視為未設定，避免用範例值啟動 bot。
function readRequiredSecret(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();

  if (!value || value.startsWith("replace_with_")) {
    throw new Error(`${key} is required for Discord bot commands.`);
  }

  return value;
}

// Discord application id 必須是 snowflake 數字字串，先在啟動期阻擋明顯錯誤設定。
function readRequiredSnowflake(env: NodeJS.ProcessEnv, key: string): string {
  const value = readRequiredSecret(env, key);

  if (!DISCORD_SNOWFLAKE_PATTERN.test(value)) {
    throw new Error(`${key} must be a Discord snowflake id.`);
  }

  return value;
}

// 解析 feature flag env，只接受明確 true/false 語意，避免拼字錯誤被默默套用預設值。
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

// 正規化 HTTP(S) base URL，移除 path 尾端斜線與 query/hash。
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

// 正規化 Discord Gateway WebSocket URL，保留 query 參數但移除 hash。
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

// 輸出 Discord bot CLI 說明，供手動啟動或維運檢查參數時使用。
export function printDiscordBotHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:discord-bot -- [options]

Options:
  --register-commands         Register slash commands and exit.
`);
}
