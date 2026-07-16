// apps/crawler/src/scripts/ops/discord-bot/interactions/modal-submit.ts
// 分派 Discord modal submit interaction，處理 price-report、public-report 與 watch 表單提交流程。

import {
  parsePriceReportModalSubmit,
  parsePublicReportModalSubmit,
  parseTargetPriceWatchModalSubmit,
} from "../commands";
import {
  enableDailyScheduledPriceReport,
  formatTaipeiMinute,
  readPriceReportSetting,
  toPriceReportFilters,
} from "../price-report";
import { toWindowHours } from "../price-report/schedule";
import { updatePublicPriceReportFilters } from "../public-price-report";
import { sendInteractionResponse } from "../rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";
import { handleTargetPriceWatchModalSubmit } from "./modal-submit/watch";
import {
  createPriceReportSettingsPanelMessage,
  formatPriceReportKeywordValidationMessage,
  formatPriceReportModalValidationMessage,
  readPriceReportSettingsPanel,
  resolveTimeOfDay,
} from "./price-report-settings";
import {
  createPublicPriceReportSettingsPanelMessage,
  readPublicPriceReportSettingsPanel,
  readPublicReportInteractionContext,
} from "./public-report-settings";
import {
  sendFeatureDisabledResponse,
  sendMissingUserResponse,
  sendUnsupportedInteractionResponse,
} from "./responses";

// 處理 modal submit 入口，先解析表單來源，再依功能開關、使用者與輸入驗證結果執行設定更新。
export async function handleModalSubmitInteraction({
  client,
  interaction,
  options,
  fetchImpl,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
}): Promise<void> {
  const modal = parsePriceReportModalSubmit(interaction);
  const targetPriceWatchModal = modal ? null : parseTargetPriceWatchModalSubmit(interaction);
  const publicReportModal =
    modal || targetPriceWatchModal ? null : parsePublicReportModalSubmit(interaction);

  if (!modal && !targetPriceWatchModal && !publicReportModal) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendMissingUserResponse({ interaction, options, fetchImpl });
    return;
  }

  if (targetPriceWatchModal) {
    if (!options.targetWatchesEnabled) {
      await sendFeatureDisabledResponse({
        interaction,
        options,
        fetchImpl,
        featureName: "目標價提醒",
      });
      return;
    }

    await handleTargetPriceWatchModalSubmit({
      client,
      interaction,
      options,
      fetchImpl,
      discordUserId,
      targetPriceWatchModal,
    });
    return;
  }

  if (publicReportModal) {
    if (!options.publicReportsEnabled) {
      await sendFeatureDisabledResponse({
        interaction,
        options,
        fetchImpl,
        featureName: "公開價格報告",
      });
      return;
    }

    const publicContext = readPublicReportInteractionContext(interaction);

    if (!publicContext) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        content: "公開價格報告只能在伺服器頻道中設定。",
      });
      return;
    }

    if (!publicReportModal.productKeywordInputValid) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        content: formatPriceReportKeywordValidationMessage(),
      });
      return;
    }

    const currentPanel = await readPublicPriceReportSettingsPanel({
      client,
      discordGuildId: publicContext.discordGuildId,
      currentChannelId: publicContext.channelId,
    });

    if (!currentPanel.setting) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createPublicPriceReportSettingsPanelMessage({
          ...currentPanel,
          notice: "請先在 /public-report settings 按「設為此頻道」。",
        }),
      });
      return;
    }

    const currentFilters = toPriceReportFilters(currentPanel.setting);
    await updatePublicPriceReportFilters({
      client,
      discordGuildId: publicContext.discordGuildId,
      discordUserId,
      categoryIgrps: currentFilters.categoryIgrps,
      includePriceDrops: currentFilters.includePriceDrops,
      includePriceRises: currentFilters.includePriceRises,
      includeNewProducts: currentFilters.includeNewProducts,
      productKeyword: publicReportModal.productKeyword,
    });
    const notice = publicReportModal.productKeyword
      ? `已更新公開報告關鍵字：${publicReportModal.productKeyword}。`
      : "已清除公開報告關鍵字篩選。";
    const panel = await readPublicPriceReportSettingsPanel({
      client,
      discordGuildId: publicContext.discordGuildId,
      currentChannelId: publicContext.channelId,
      notice,
    });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createPublicPriceReportSettingsPanelMessage(panel),
    });
    return;
  }

  if (!modal) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  if (!options.personalReportsEnabled) {
    await sendFeatureDisabledResponse({
      interaction,
      options,
      fetchImpl,
      featureName: "每日私訊價格報告",
    });
    return;
  }

  if (modal.name === "keyword") {
    if (!modal.productKeywordInputValid) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        content: formatPriceReportModalValidationMessage(modal),
      });
      return;
    }

    const currentSetting = await readPriceReportSetting({ client, discordUserId });
    const currentFilters = toPriceReportFilters(currentSetting);
    await enableDailyScheduledPriceReport({
      client,
      discordUserId,
      windowHours: toWindowHours(currentSetting?.window),
      categoryIgrps: currentFilters.categoryIgrps,
      includePriceDrops: currentFilters.includePriceDrops,
      includePriceRises: currentFilters.includePriceRises,
      includeNewProducts: currentFilters.includeNewProducts,
      productKeyword: modal.productKeyword,
      timeOfDay: resolveTimeOfDay(currentSetting?.nextSendAt),
    });
    const panel = await readPriceReportSettingsPanel({
      client,
      discordUserId,
      notice: modal.productKeyword
        ? `已更新商品關鍵字：${modal.productKeyword}。`
        : "已清除商品關鍵字篩選。",
    });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createPriceReportSettingsPanelMessage(panel),
    });
    return;
  }

  if (!modal.timeInputValid) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: formatPriceReportModalValidationMessage(modal),
    });
    return;
  }

  const currentSetting = await readPriceReportSetting({ client, discordUserId });
  const currentFilters = toPriceReportFilters(currentSetting);
  const setting = await enableDailyScheduledPriceReport({
    client,
    discordUserId,
    windowHours: toWindowHours(currentSetting?.window),
    categoryIgrps: currentFilters.categoryIgrps,
    includePriceDrops: currentFilters.includePriceDrops,
    includePriceRises: currentFilters.includePriceRises,
    includeNewProducts: currentFilters.includeNewProducts,
    productKeyword: currentFilters.productKeyword,
    timeOfDay: modal.timeOfDay,
  });
  const panel = await readPriceReportSettingsPanel({
    client,
    discordUserId,
    notice: `已更新每日私訊價格報告。下一次：${formatTaipeiMinute(setting.nextSendAt)}。`,
  });

  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    message: createPriceReportSettingsPanelMessage(panel),
  });
}
