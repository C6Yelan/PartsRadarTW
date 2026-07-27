// apps/crawler/src/scripts/ops/discord-bot/registration.ts
// 負責把 PartsRadarTW Discord bot 的 slash commands 註冊到 Discord application。

import {
  createBotCommand,
  createPriceReportCommand,
  createPublicReportCommand,
  createStatusCommand,
  createWatchCommand,
} from "./commands";
import { sendDiscordRestRequest } from "./rest";
import type { DiscordBotOptions, DiscordRestResult, FetchImpl } from "./types";

export interface DiscordCommandRegistrationResults {
  global: DiscordRestResult<unknown>;
  statusGuild: DiscordRestResult<unknown> | null;
}

// 使用 Discord application commands bulk overwrite API，同步目前程式定義的指令集合。
export async function registerDiscordBotCommands({
  token,
  applicationId,
  apiBaseUrl,
  statusGuildId = null,
  fetchImpl = fetch,
}: Pick<DiscordBotOptions, "token" | "applicationId" | "apiBaseUrl"> & {
  statusGuildId?: string | null;
  fetchImpl?: FetchImpl;
}): Promise<DiscordCommandRegistrationResults> {
  const global = await sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/commands`,
    body: [
      createPriceReportCommand(),
      createWatchCommand(),
      createPublicReportCommand(),
      createBotCommand(),
    ],
  });

  if (global.status !== "ok" || !statusGuildId) {
    return { global, statusGuild: null };
  }

  const statusGuild = await sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/guilds/${statusGuildId}/commands`,
    body: [createStatusCommand()],
  });

  return { global, statusGuild };
}
