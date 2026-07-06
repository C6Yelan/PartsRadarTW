// apps/crawler/src/scripts/ops/discord-bot/interactions/price-report-handler.ts
// 處理個人 price-report 設定面板的 component interaction，協調預覽、modal 開啟與設定更新。

import {
  createPriceReportKeywordModal,
  createPriceReportTimeLimitModal,
  type parsePriceReportComponentInteraction,
} from "../commands";
import type { CommandCooldowns } from "../cooldowns";
import {
  disablePriceReport,
  enableDailyScheduledPriceReport,
  readPriceReportSetting,
  sendPriceReportNow,
  toPriceReportFilters,
} from "../price-report";
import {
  deferInteractionMessageUpdate,
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendDiscordDirectMessages,
  sendInteractionResponse,
  sendModalInteractionResponse,
} from "../rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";
import {
  createPriceReportSettingsPanelMessage,
  formatPriceReportPreviewDmNotice,
  formatTaipeiTimeInput,
  parsePriceReportCategorySelection,
  readPriceReportSettingsPanel,
  resolveTimeOfDay,
  resolveWindowHours,
} from "./price-report-settings";

type PriceReportComponent = NonNullable<ReturnType<typeof parsePriceReportComponentInteraction>>;

// 根據 price-report component command 執行對應互動；會保留既有設定並只更新使用者操作的欄位。
export async function handlePriceReportComponentInteraction({
  client,
  interaction,
  options,
  cooldowns,
  fetchImpl,
  discordUserId,
  component,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  cooldowns: CommandCooldowns;
  fetchImpl: FetchImpl;
  discordUserId: string;
  component: PriceReportComponent;
}): Promise<void> {
  if (component.name === "preview_report") {
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
      ephemeral: true,
    });

    const setting = await readPriceReportSetting({ client, discordUserId });

    const previewResult = await sendPriceReportNow({
      client,
      discordUserId,
      windowHours: resolveWindowHours(setting?.window),
      maxItems: setting
        ? Math.min(setting.maxItems, options.priceReportMaxItems)
        : options.priceReportMaxItems,
      publicBaseUrl: options.publicBaseUrl,
      filters: toPriceReportFilters(setting),
      sendReportMessages: (messages) =>
        sendDiscordDirectMessages({
          token: options.token,
          apiBaseUrl: options.apiBaseUrl,
          userId: discordUserId,
          messages,
          fetchImpl,
        }),
    });
    const panel = await readPriceReportSettingsPanel({
      client,
      discordUserId,
      options,
      notice: formatPriceReportPreviewDmNotice(previewResult),
    });

    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createPriceReportSettingsPanelMessage(panel),
    });
    return;
  }

  if (component.name === "open_time_limit_modal") {
    const setting = await readPriceReportSetting({ client, discordUserId });

    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createPriceReportTimeLimitModal({
        maxItems: setting?.maxItems ?? options.priceReportMaxItems,
        timeValue: formatTaipeiTimeInput(setting?.nextSendAt),
      }),
    });
    return;
  }

  if (component.name === "open_keyword_modal") {
    const setting = await readPriceReportSetting({ client, discordUserId });

    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createPriceReportKeywordModal({
        keywordValue: setting?.productKeyword ?? "",
      }),
    });
    return;
  }

  await deferInteractionMessageUpdate({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
  });

  let notice: string;

  if (component.name === "disable_daily_scheduled_report") {
    const disabledCount = await disablePriceReport({ client, discordUserId });
    notice = disabledCount > 0 ? "已關閉每日價格提醒。" : "目前沒有開啟每日價格提醒。";
  } else {
    const currentPanel = await readPriceReportSettingsPanel({
      client,
      discordUserId,
      options,
    });
    const currentFilters = toPriceReportFilters(currentPanel.setting);
    const categoryIgrps =
      component.name === "update_categories"
        ? parsePriceReportCategorySelection(component.values, currentPanel.categories)
        : component.name === "update_all_categories"
          ? []
          : currentFilters.categoryIgrps;

    if (categoryIgrps === null) {
      await editDeferredInteractionResponse({
        token: options.token,
        applicationId: options.applicationId,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createPriceReportSettingsPanelMessage({
          ...currentPanel,
          notice: "分類選擇無法辨識，請重新選擇。",
        }),
      });
      return;
    }

    await enableDailyScheduledPriceReport({
      client,
      discordUserId,
      windowHours:
        component.name === "update_window"
          ? component.windowHours
          : resolveWindowHours(currentPanel.setting?.window),
      maxItems: currentPanel.setting?.maxItems ?? options.priceReportMaxItems,
      categoryIgrps,
      includePriceDrops:
        component.name === "update_content_filters"
          ? component.includePriceDrops
          : currentFilters.includePriceDrops,
      includePriceRises:
        component.name === "update_content_filters"
          ? component.includePriceRises
          : currentFilters.includePriceRises,
      includeNewProducts:
        component.name === "update_content_filters"
          ? component.includeNewProducts
          : currentFilters.includeNewProducts,
      productKeyword: currentFilters.productKeyword,
      timeOfDay: resolveTimeOfDay(currentPanel.setting?.nextSendAt),
    });
    notice =
      component.name === "enable_daily_scheduled_report"
        ? "已開啟每日價格提醒。"
        : "已更新每日價格提醒設定。";
  }

  const panel = await readPriceReportSettingsPanel({
    client,
    discordUserId,
    options,
    notice,
  });

  await editDeferredInteractionResponse({
    token: options.token,
    applicationId: options.applicationId,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    message: createPriceReportSettingsPanelMessage(panel),
  });
}
