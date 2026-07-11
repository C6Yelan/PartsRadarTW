// apps/crawler/src/scripts/ops/discord-bot/interactions/public-report-settings.ts
// 提供 public-report interaction 共用流程，包含伺服器頻道 context、測試發送與設定面板資料讀取。

import type { CommandCooldowns } from "../cooldowns";
import { readPriceReportCategories } from "../price-report";
import {
  readLatestPublicPriceReportDelivery,
  readPublicPriceReportSetting,
  sendPublicPriceReportPreview,
  toPublicPriceReportFilters,
} from "../public-price-report";
import {
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendDiscordChannelMessages,
  sendInteractionResponse,
} from "../rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";
import {
  formatPublicReportBotPermissionNotice,
  formatPublicReportPreviewNotice,
  type PublicPriceReportSettingsPanel,
} from "./public-report-settings/messages";

export {
  createPublicPriceReportSettingsPanelMessage,
  createPublicPriceReportStatusMessage,
  formatPublicReportBotPermissionNotice,
} from "./public-report-settings/messages";

interface PublicReportInteractionContext {
  discordGuildId: string;
  channelId: string;
}

// 從 Discord interaction 擷取 public-report 必要的伺服器與頻道資訊；DM 或缺少頻道時回傳 null。
export function readPublicReportInteractionContext(
  interaction: DiscordInteraction,
): PublicReportInteractionContext | null {
  const discordGuildId = interaction.guild_id?.trim();
  const channelId = interaction.channel_id?.trim();

  return discordGuildId && channelId ? { discordGuildId, channelId } : null;
}

// 執行 public-report 測試發送流程，套用使用者冷卻、頻道權限檢查與目前公開報告篩選設定。
export async function sendPublicReportTest({
  client,
  interaction,
  options,
  cooldowns,
  fetchImpl,
  discordUserId,
  publicContext,
  missingSettingMessage,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  cooldowns: CommandCooldowns;
  fetchImpl: FetchImpl;
  discordUserId: string;
  publicContext: PublicReportInteractionContext;
  missingSettingMessage: string;
}): Promise<void> {
  const cooldown = cooldowns.consume(discordUserId, new Date());

  if (!cooldown.allowed) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: `請等待 ${cooldown.retryAfterSeconds} 秒後再發送下一份測試報告。`,
    });
    return;
  }

  await deferInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    ephemeral: true,
  });

  const setting = await readPublicPriceReportSetting({
    client,
    discordGuildId: publicContext.discordGuildId,
  });

  if (!setting) {
    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: missingSettingMessage,
    });
    return;
  }

  const permissionNotice =
    setting.channelId === publicContext.channelId
      ? formatPublicReportBotPermissionNotice(interaction, setting.channelId)
      : null;

  if (permissionNotice) {
    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: permissionNotice,
    });
    return;
  }

  const previewResult = await sendPublicPriceReportPreview({
    client,
    channelId: setting.channelId,
    publicBaseUrl: options.publicBaseUrl,
    filters: toPublicPriceReportFilters(setting),
    sendChannelMessages: (channelId, messages) =>
      sendDiscordChannelMessages({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        channelId,
        messages,
        fetchImpl,
      }),
  });
  const categories = await readPriceReportCategories({ client });

  await editDeferredInteractionResponse({
    token: options.token,
    applicationId: options.applicationId,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: formatPublicReportPreviewNotice(previewResult, setting.channelId, setting, categories),
  });
}

// 讀取 public-report 設定面板所需資料，包含目前伺服器設定、可選分類與最近一次公開報告狀態。
export async function readPublicPriceReportSettingsPanel({
  client,
  discordGuildId,
  currentChannelId,
  notice,
}: {
  client: DiscordBotClient;
  discordGuildId: string;
  currentChannelId: string;
  notice?: string;
}): Promise<PublicPriceReportSettingsPanel> {
  const [setting, categories] = await Promise.all([
    readPublicPriceReportSetting({ client, discordGuildId }),
    readPriceReportCategories({ client }),
  ]);
  const latestDelivery = setting
    ? await readLatestPublicPriceReportDelivery({ client, channelId: setting.channelId })
    : null;

  return {
    setting,
    latestDelivery,
    categories,
    currentChannelId,
    notice,
  };
}
