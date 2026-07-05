// apps/crawler/src/scripts/ops/discord-bot/interactions/modal-submit.ts

import {
  parsePriceReportModalSubmit,
  parsePublicReportModalSubmit,
  parseTargetPriceWatchModalSubmit,
} from "../commands";
import { MAX_PRICE_REPORT_ITEMS } from "../constants";
import {
  enableDailyScheduledPriceReport,
  formatTaipeiMinute,
  readPriceReportSetting,
  toPriceReportFilters,
} from "../price-report";
import { toPublicPriceReportFilters, updatePublicPriceReportFilters } from "../public-price-report";
import { sendInteractionResponse } from "../rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";
import {
  createPriceReportSettingsPanelMessage,
  formatPriceReportKeywordValidationMessage,
  formatPriceReportModalValidationMessage,
  readPriceReportSettingsPanel,
  resolveTimeOfDay,
  resolveWindowHours,
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
import { handleTargetPriceWatchModalSubmit } from "./modal-submit/watch";

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
        content: "目標價提醒目前已由維運暫停。",
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
        content: "公開價格報告目前已由維運暫停。",
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

    if (
      (publicReportModal.name === "limit" && !publicReportModal.maxItemsInputValid) ||
      (publicReportModal.name === "keyword" && !publicReportModal.productKeywordInputValid)
    ) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        content:
          publicReportModal.name === "limit"
            ? `最多商品數需為 1-${MAX_PRICE_REPORT_ITEMS} 的整數。`
            : formatPriceReportKeywordValidationMessage(),
      });
      return;
    }

    const currentPanel = await readPublicPriceReportSettingsPanel({
      client,
      discordGuildId: publicContext.discordGuildId,
      currentChannelId: publicContext.channelId,
      options,
    });

    if (!currentPanel.setting) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createPublicPriceReportSettingsPanelMessage({
          ...currentPanel,
          notice: "請先使用 /public-report manage 將公開報告設為目前頻道。",
        }),
      });
      return;
    }

    const currentFilters = toPublicPriceReportFilters(currentPanel.setting);
    const updatedSetting = await updatePublicPriceReportFilters({
      client,
      discordGuildId: publicContext.discordGuildId,
      discordUserId,
      maxItems:
        publicReportModal.name === "limit"
          ? (publicReportModal.maxItems ?? currentPanel.setting.maxItems)
          : currentPanel.setting.maxItems,
      categoryIgrps: currentFilters.categoryIgrps,
      includePriceDrops: currentFilters.includePriceDrops,
      includePriceRises: currentFilters.includePriceRises,
      includeNewProducts: currentFilters.includeNewProducts,
      productKeyword:
        publicReportModal.name === "keyword"
          ? publicReportModal.productKeyword
          : currentFilters.productKeyword,
    });
    const notice =
      publicReportModal.name === "limit"
        ? `已更新公開報告顯示上限：${updatedSetting?.maxItems ?? currentPanel.setting.maxItems} 筆。`
        : publicReportModal.productKeyword
          ? `已更新公開報告關鍵字：${publicReportModal.productKeyword}。`
          : "已清除公開報告關鍵字篩選。";
    const panel = await readPublicPriceReportSettingsPanel({
      client,
      discordGuildId: publicContext.discordGuildId,
      currentChannelId: publicContext.channelId,
      options,
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
      content: "個人價格報告目前已由維運暫停。",
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
      windowHours: resolveWindowHours(currentSetting?.window),
      maxItems: currentSetting?.maxItems ?? options.priceReportMaxItems,
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
      options,
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

  if (!modal.maxItemsInputValid || !modal.timeInputValid) {
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
    windowHours: resolveWindowHours(currentSetting?.window),
    maxItems: modal.maxItems ?? options.priceReportMaxItems,
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
    options,
    notice: `已更新每日價格提醒。下一次：${formatTaipeiMinute(setting.nextSendAt)}。`,
  });

  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    message: createPriceReportSettingsPanelMessage(panel),
  });
}
