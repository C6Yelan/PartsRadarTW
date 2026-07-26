// 處理管理員限定的 /status interaction；狀態查詢與訊息組裝由 status-message 負責。

import type { CrawlerRuntimeStatus } from "../../crawl-coolpc-daemon/runtime-status";
import { DISCORD_PERMISSION_MANAGE_GUILD } from "../constants";
import { sendInteractionResponse } from "../rest";
import type { DiscordBotSchedulerStatusReader } from "../scheduler-status";
import type { DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";
import { createStatusMessage } from "./status-message";
import type { StatusClient } from "./status-snapshot";

export { createStatusMessage } from "./status-message";

export async function handleStatusInteraction({
  client,
  interaction,
  options,
  fetchImpl,
  schedulerStatus,
  crawlerRuntimeStatus,
  now = new Date(),
}: {
  client: StatusClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  schedulerStatus?: DiscordBotSchedulerStatusReader;
  crawlerRuntimeStatus?: CrawlerRuntimeStatus | null;
  now?: Date;
}): Promise<void> {
  if (!hasManageGuildPermission(interaction)) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: "你沒有使用這個指令的權限。",
    });
    return;
  }

  const message = await createStatusMessage({
    client,
    options,
    schedulerStatus,
    crawlerRuntimeStatus,
    now,
  });

  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    message,
  });
}

function hasManageGuildPermission(interaction: DiscordInteraction): boolean {
  if (
    !interaction.guild_id ||
    !interaction.member?.permissions ||
    !/^(0|[1-9][0-9]*)$/.test(interaction.member.permissions)
  ) {
    return false;
  }

  try {
    return (BigInt(interaction.member.permissions) & DISCORD_PERMISSION_MANAGE_GUILD) !== 0n;
  } catch {
    return false;
  }
}
