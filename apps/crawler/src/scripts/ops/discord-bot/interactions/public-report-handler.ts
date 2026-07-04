// apps/crawler/src/scripts/ops/discord-bot/interactions/public-report-handler.ts

import {
  createPublicReportKeywordModal,
  createPublicReportLimitModal,
  type parsePublicReportComponentInteraction,
} from "../commands";
import type { CommandCooldowns } from "../cooldowns";
import {
  clearPublicPriceReportSetting,
  readPublicPriceReportSetting,
  setPublicPriceReportChannel,
  setPublicPriceReportEnabled,
  toPublicPriceReportFilters,
  updatePublicPriceReportFilters,
} from "../public-price-report";
import {
  deferInteractionMessageUpdate,
  editDeferredInteractionResponse,
  sendInteractionResponse,
  sendModalInteractionResponse,
} from "../rest";
import type {
  DiscordBotClient,
  DiscordBotOptions,
  DiscordInteraction,
  FetchImpl,
} from "../types";
import { parsePriceReportCategorySelection } from "./price-report-settings";
import {
  createPublicPriceReportSettingsPanelMessage,
  formatPublicReportBotPermissionNotice,
  readPublicPriceReportSettingsPanel,
  readPublicReportInteractionContext,
  sendPublicReportTest,
} from "./public-report-settings";

type PublicReportComponent = NonNullable<ReturnType<typeof parsePublicReportComponentInteraction>>;

export async function handlePublicReportComponentInteraction({
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
  component: PublicReportComponent;
}): Promise<void> {
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

  if (component.name === "open_keyword_modal") {
    const setting = await readPublicPriceReportSetting({
      client,
      discordGuildId: publicContext.discordGuildId,
    });

    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createPublicReportKeywordModal({
        keywordValue: setting?.productKeyword ?? "",
      }),
    });
    return;
  }

  if (component.name === "open_limit_modal") {
    const setting = await readPublicPriceReportSetting({
      client,
      discordGuildId: publicContext.discordGuildId,
    });

    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createPublicReportLimitModal({
        maxItems: setting?.maxItems ?? options.priceReportMaxItems,
      }),
    });
    return;
  }

  if (component.name === "preview") {
    await sendPublicReportTest({
      client,
      interaction,
      options,
      cooldowns,
      fetchImpl,
      discordUserId,
      publicContext,
      missingSettingMessage: "尚未設定公開報告頻道，請先按「設為此頻道」。",
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

  if (component.name === "set_channel") {
    const permissionNotice = formatPublicReportBotPermissionNotice(
      interaction,
      publicContext.channelId,
    );

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

    await setPublicPriceReportChannel({
      client,
      discordGuildId: publicContext.discordGuildId,
      channelId: publicContext.channelId,
      discordUserId,
    });
    notice = `已將公開報告頻道設為 <#${publicContext.channelId}>，並開啟公開報告。`;
  } else if (component.name === "enable") {
    const setting = await setPublicPriceReportEnabled({
      client,
      discordGuildId: publicContext.discordGuildId,
      channelId: publicContext.channelId,
      discordUserId,
      enabled: true,
    });
    notice = `已啟用公開價格報告，發送頻道為 <#${setting.channelId}>。`;
  } else if (component.name === "disable") {
    const setting = await setPublicPriceReportEnabled({
      client,
      discordGuildId: publicContext.discordGuildId,
      channelId: publicContext.channelId,
      discordUserId,
      enabled: false,
    });
    notice = `已暫停公開價格報告，設定頻道保留為 <#${setting.channelId}>。`;
  } else if (component.name === "clear") {
    const deletedCount = await clearPublicPriceReportSetting({
      client,
      discordGuildId: publicContext.discordGuildId,
    });
    notice = deletedCount > 0 ? "已清除公開價格報告設定。" : "目前沒有公開價格報告設定。";
  } else {
    const currentPanel = await readPublicPriceReportSettingsPanel({
      client,
      discordGuildId: publicContext.discordGuildId,
      currentChannelId: publicContext.channelId,
      options,
    });
    const currentFilters = toPublicPriceReportFilters(currentPanel.setting);
    const categoryIgrps =
      component.name === "update_categories"
        ? parsePriceReportCategorySelection(component.values, currentPanel.categories)
        : component.name === "update_all_categories"
          ? []
          : currentFilters.categoryIgrps;

    if (!currentPanel.setting) {
      await editDeferredInteractionResponse({
        token: options.token,
        applicationId: options.applicationId,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createPublicPriceReportSettingsPanelMessage({
          ...currentPanel,
          notice: "請先將公開報告設為目前頻道。",
        }),
      });
      return;
    }

    if (categoryIgrps === null) {
      await editDeferredInteractionResponse({
        token: options.token,
        applicationId: options.applicationId,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createPublicPriceReportSettingsPanelMessage({
          ...currentPanel,
          notice: "分類選擇無法辨識，請重新選擇。",
        }),
      });
      return;
    }

    await updatePublicPriceReportFilters({
      client,
      discordGuildId: publicContext.discordGuildId,
      discordUserId,
      categoryIgrps,
      includePriceDrops:
        component.name === "update_events"
          ? component.includePriceDrops
          : currentFilters.includePriceDrops,
      includePriceRises:
        component.name === "update_events"
          ? component.includePriceRises
          : currentFilters.includePriceRises,
      includeNewProducts:
        component.name === "update_events"
          ? component.includeNewProducts
          : currentFilters.includeNewProducts,
    });
    notice = "已更新公開價格報告設定。";
  }

  const panel = await readPublicPriceReportSettingsPanel({
    client,
    discordGuildId: publicContext.discordGuildId,
    currentChannelId: publicContext.channelId,
    options,
    notice,
  });

  await editDeferredInteractionResponse({
    token: options.token,
    applicationId: options.applicationId,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    message: createPublicPriceReportSettingsPanelMessage(panel),
  });
}
