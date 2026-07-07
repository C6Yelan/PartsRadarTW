// apps/crawler/src/scripts/ops/discord-bot/registration.ts
// 負責把 PartsRadarTW Discord bot 的 slash commands 註冊到 Discord application。

import {
  createBotCommand,
  createPriceReportCommand,
  createPublicReportCommand,
  createWatchCommand,
} from "./commands";
import { sendDiscordRestRequest } from "./rest";
import type { DiscordBotOptions, DiscordRestResult, FetchImpl } from "./types";

// 使用 Discord application commands bulk overwrite API，同步目前程式定義的指令集合。
export async function registerDiscordBotCommands({
  token,
  applicationId,
  apiBaseUrl,
  fetchImpl = fetch,
}: Pick<DiscordBotOptions, "token" | "applicationId" | "apiBaseUrl"> & {
  fetchImpl?: FetchImpl;
}): Promise<DiscordRestResult<unknown>> {
  return sendDiscordRestRequest<unknown>({
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
}
