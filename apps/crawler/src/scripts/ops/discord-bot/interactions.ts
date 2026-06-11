// apps/crawler/src/scripts/ops/discord-bot/interactions.ts

import { DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND } from "./constants";
import { parsePriceReportInteraction } from "./commands";
import type { CommandCooldowns } from "./cooldowns";
import {
  disablePriceReport,
  enableDailyPriceReport,
  formatPriceReportSettingMessage,
  formatTaipeiMinute,
  formatWindowLabel,
  readPriceReportSetting,
  sendPriceReportNow,
} from "./price-report";
import {
  deferInteractionResponse,
  sendDiscordInteractionMessages,
  sendInteractionResponse,
} from "./rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "./types";

export async function handleDiscordInteraction({
  client,
  interaction,
  options,
  cooldowns,
  fetchImpl = fetch,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  cooldowns: CommandCooldowns;
  fetchImpl?: FetchImpl;
}): Promise<void> {
  if (interaction.type !== DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND) {
    return;
  }

  const command = parsePriceReportInteraction(interaction);

  if (!command) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: "這個 PartsRadarTW bot 版本尚未支援此指令。",
    });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: "無法辨識這次指令的 Discord 使用者。",
    });
    return;
  }

  if (command.name === "now") {
    const cooldown = cooldowns.consume(discordUserId, new Date());

    if (!cooldown.allowed) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        content: `請等待 ${cooldown.retryAfterSeconds} 秒後再產生下一份價格報告。`,
      });
      return;
    }

    await deferInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
    });

    await sendPriceReportNow({
      client,
      discordUserId,
      windowHours: command.windowHours,
      maxItems: command.maxItems ?? options.priceReportMaxItems,
      publicBaseUrl: options.publicBaseUrl,
      sendReportMessages: (messages) =>
        sendDiscordInteractionMessages({
          token: options.token,
          applicationId: options.applicationId,
          apiBaseUrl: options.apiBaseUrl,
          interaction,
          messages,
          fetchImpl,
        }),
    });
    return;
  }

  if (command.name === "enable") {
    if (!command.timeInputValid) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        content: "每日發送時間格式需為台北時間 HH:mm，例如 `09:30` 或 `21:00`。",
      });
      return;
    }

    const setting = await enableDailyPriceReport({
      client,
      discordUserId,
      windowHours: command.windowHours,
      maxItems: command.maxItems ?? options.priceReportMaxItems,
      timeOfDay: command.timeOfDay,
    });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: `已開啟每日價格提醒。報告會以私訊發送，區間：${formatWindowLabel(setting.window)}，上限：${setting.maxItems} 筆，下一次：${formatTaipeiMinute(setting.nextSendAt)}。`,
    });
    return;
  }

  if (command.name === "disable") {
    const disabledCount = await disablePriceReport({ client, discordUserId });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: disabledCount > 0 ? "已關閉每日價格提醒。" : "目前沒有開啟每日價格提醒。",
    });
    return;
  }

  const setting = await readPriceReportSetting({ client, discordUserId });

  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: formatPriceReportSettingMessage(setting),
  });
}
