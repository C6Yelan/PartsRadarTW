// apps/crawler/src/scripts/ops/discord-bot/interactions.ts

import {
  createPriceReportSettingsComponents,
  createPriceReportTimeLimitModal,
  createWatchEditModal,
  createWatchModal,
  parsePriceReportComponentInteraction,
  parsePriceReportInteraction,
  parsePriceReportModalSubmit,
  parseWatchComponentInteraction,
  parseWatchInteraction,
  parseWatchModalSubmit,
} from "./commands";
import {
  DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND,
  DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT,
  DISCORD_INTERACTION_TYPE_MODAL_SUBMIT,
  MAX_PRICE_REPORT_ITEMS,
  MAX_TARGET_PRICE,
} from "./constants";
import type { CommandCooldowns } from "./cooldowns";
import {
  disablePriceReport,
  enableDailyPriceReport,
  formatPriceReportSettingMessage,
  formatTaipeiMinute,
  type PriceReportCategoryOption,
  readPriceReportCategories,
  readPriceReportSetting,
  sendPriceReportNow,
  toPriceReportFilters,
} from "./price-report";
import {
  deferInteractionMessageUpdate,
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendDiscordInteractionMessages,
  sendInteractionResponse,
  sendModalInteractionResponse,
} from "./rest";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotOptions,
  DiscordInteraction,
  FetchImpl,
  PriceReportTimeOfDay,
} from "./types";
import {
  createTargetPriceWatch,
  createTargetPriceWatchManagerMessage,
  createTargetPriceWatchRemovalConfirmationMessage,
  createTargetPriceWatchResponseMessage,
  disableTargetPriceWatch,
  readTargetPriceWatch,
  readTargetPriceWatchlist,
  updateTargetPriceWatch,
} from "./watch";

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
  if (interaction.type === DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND) {
    await handleApplicationCommandInteraction({
      client,
      interaction,
      options,
      cooldowns,
      fetchImpl,
    });
    return;
  }

  if (interaction.type === DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT) {
    await handleMessageComponentInteraction({
      client,
      interaction,
      options,
      fetchImpl,
    });
    return;
  }

  if (interaction.type === DISCORD_INTERACTION_TYPE_MODAL_SUBMIT) {
    await handleModalSubmitInteraction({
      client,
      interaction,
      options,
      fetchImpl,
    });
  }
}

async function handleApplicationCommandInteraction({
  client,
  interaction,
  options,
  cooldowns,
  fetchImpl,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  cooldowns: CommandCooldowns;
  fetchImpl: FetchImpl;
}): Promise<void> {
  const command = parsePriceReportInteraction(interaction);
  const watchCommand = command ? false : parseWatchInteraction(interaction);

  if (!command && !watchCommand) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendMissingUserResponse({ interaction, options, fetchImpl });
    return;
  }

  if (command) {
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

      const setting = await readPriceReportSetting({ client, discordUserId });
      const activeSetting = setting?.enabled ? setting : null;

      await sendPriceReportNow({
        client,
        discordUserId,
        windowHours: command.windowHours ?? resolveWindowHours(activeSetting?.window),
        maxItems:
          command.maxItems ??
          (activeSetting
            ? Math.min(activeSetting.maxItems, options.priceReportMaxItems)
            : options.priceReportMaxItems),
        publicBaseUrl: options.publicBaseUrl,
        filters: toPriceReportFilters(activeSetting),
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

    const panel = await readPriceReportSettingsPanel({
      client,
      discordUserId,
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

  if (watchCommand) {
    await deferInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      ephemeral: true,
    });

    const result = await readWatchManagerPage({ client, discordUserId, page: 0 });

    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createTargetPriceWatchManagerMessage({
        result,
        publicBaseUrl: options.publicBaseUrl,
      }),
    });
    return;
  }

  await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
}

async function handleMessageComponentInteraction({
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
  const component = parsePriceReportComponentInteraction(interaction);
  const watchComponent = component ? null : parseWatchComponentInteraction(interaction);

  if (!component && !watchComponent) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendMissingUserResponse({ interaction, options, fetchImpl });
    return;
  }

  if (watchComponent?.action === "add") {
    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createWatchModal(),
    });
    return;
  }

  if (watchComponent?.action === "edit") {
    const watchId = extractWatchId(watchComponent.watchInput);

    if (!watchId || !watchComponent.targetPrice) {
      await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
      return;
    }

    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createWatchEditModal({
        watchId,
        targetPrice: watchComponent.targetPrice,
        page: watchComponent.page,
      }),
    });
    return;
  }

  if (watchComponent) {
    await deferInteractionMessageUpdate({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
    });

    if (watchComponent.action === "remove") {
      const lookup = await readTargetPriceWatch({
        client,
        discordUserId,
        watchInput: watchComponent.watchInput,
      });

      await editDeferredInteractionResponse({
        token: options.token,
        applicationId: options.applicationId,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createTargetPriceWatchRemovalConfirmationMessage({
          result: lookup,
          publicBaseUrl: options.publicBaseUrl,
          page: watchComponent.page,
        }),
      });
      return;
    }

    if (watchComponent.action === "confirm_remove") {
      const disabled = await disableTargetPriceWatch({
        client,
        discordUserId,
        watchInput: watchComponent.watchInput,
      });
      const result = await readWatchManagerPage({
        client,
        discordUserId,
        page: watchComponent.page,
      });

      await editDeferredInteractionResponse({
        token: options.token,
        applicationId: options.applicationId,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createTargetPriceWatchManagerMessage({
          result,
          publicBaseUrl: options.publicBaseUrl,
          notice:
            disabled.status === "disabled"
              ? "已移除目標價追蹤。"
              : "追蹤已不存在，清單已重新整理。",
        }),
      });
      return;
    }

    const result = await readWatchManagerPage({
      client,
      discordUserId,
      page: watchComponent.page,
    });
    const selectedWatchInput =
      watchComponent.action === "select" || watchComponent.action === "cancel_remove"
        ? watchComponent.watchInput
        : null;

    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createTargetPriceWatchManagerMessage({
        result,
        publicBaseUrl: options.publicBaseUrl,
        selectedWatchInput,
      }),
    });
    return;
  }

  if (component?.name === "open_time_limit_modal") {
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

  await deferInteractionMessageUpdate({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
  });

  let notice: string;

  if (component?.name === "disable_daily_report") {
    const disabledCount = await disablePriceReport({ client, discordUserId });
    notice = disabledCount > 0 ? "已關閉每日價格提醒。" : "目前沒有開啟每日價格提醒。";
  } else {
    const currentPanel = await readPriceReportSettingsPanel({
      client,
      discordUserId,
    });
    const currentFilters = toPriceReportFilters(currentPanel.setting);
    const categoryIgrps =
      component?.name === "update_categories"
        ? parsePriceReportCategorySelection(component.values, currentPanel.categories)
        : component?.name === "update_all_categories"
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

    await enableDailyPriceReport({
      client,
      discordUserId,
      windowHours:
        component?.name === "update_window"
          ? component.windowHours
          : resolveWindowHours(currentPanel.setting?.window),
      maxItems: currentPanel.setting?.maxItems ?? options.priceReportMaxItems,
      categoryIgrps,
      includePriceDrops:
        component?.name === "update_events"
          ? component.includePriceDrops
          : currentFilters.includePriceDrops,
      includePriceRises:
        component?.name === "update_events"
          ? component.includePriceRises
          : currentFilters.includePriceRises,
      includeNewProducts:
        component?.name === "update_events"
          ? component.includeNewProducts
          : currentFilters.includeNewProducts,
      timeOfDay: resolveTimeOfDay(currentPanel.setting?.nextSendAt),
    });
    notice =
      component?.name === "enable_daily_report"
        ? "已開啟每日價格提醒。"
        : "已更新每日價格提醒設定。";
  }

  const panel = await readPriceReportSettingsPanel({
    client,
    discordUserId,
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

async function handleModalSubmitInteraction({
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
  const watchModal = modal ? null : parseWatchModalSubmit(interaction);

  if (!modal && !watchModal) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendMissingUserResponse({ interaction, options, fetchImpl });
    return;
  }

  if (watchModal) {
    if (
      !watchModal.targetPriceInputValid ||
      (watchModal.action === "create" && !watchModal.productInputValid)
    ) {
      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        content: formatWatchModalValidationMessage(watchModal),
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

    if (watchModal.action === "edit") {
      const updateResult = await updateTargetPriceWatch({
        client,
        discordUserId,
        watchInput: watchModal.watchInput,
        targetPrice: watchModal.targetPrice,
      });
      const result = await readWatchManagerPage({
        client,
        discordUserId,
        page: watchModal.page,
      });

      await editDeferredInteractionResponse({
        token: options.token,
        applicationId: options.applicationId,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createTargetPriceWatchManagerMessage({
          result,
          publicBaseUrl: options.publicBaseUrl,
          selectedWatchInput:
            updateResult.status === "updated" ? `watch:${updateResult.watch.id}` : null,
          notice:
            updateResult.status === "updated"
              ? "已更新目標價格。"
              : "無法更新追蹤，清單已重新整理。",
        }),
      });
      return;
    }

    const createResult = await createTargetPriceWatch({
      client,
      discordUserId,
      productInput: watchModal.productInput,
      targetPrice: watchModal.targetPrice,
    });

    if (createResult.status === "saved") {
      const result = await readWatchManagerPage({ client, discordUserId, page: 0 });

      await editDeferredInteractionResponse({
        token: options.token,
        applicationId: options.applicationId,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createTargetPriceWatchManagerMessage({
          result,
          publicBaseUrl: options.publicBaseUrl,
          selectedWatchInput: `watch:${createResult.watch.id}`,
          notice: "已儲存商品目標價。",
        }),
      });
      return;
    }

    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createTargetPriceWatchResponseMessage({
        result: createResult,
        publicBaseUrl: options.publicBaseUrl,
      }),
    });
    return;
  }

  if (!modal) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
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
  const setting = await enableDailyPriceReport({
    client,
    discordUserId,
    windowHours: resolveWindowHours(currentSetting?.window),
    maxItems: modal.maxItems ?? options.priceReportMaxItems,
    categoryIgrps: currentFilters.categoryIgrps,
    includePriceDrops: currentFilters.includePriceDrops,
    includePriceRises: currentFilters.includePriceRises,
    includeNewProducts: currentFilters.includeNewProducts,
    timeOfDay: modal.timeOfDay,
  });
  const panel = await readPriceReportSettingsPanel({
    client,
    discordUserId,
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

async function sendUnsupportedInteractionResponse({
  interaction,
  options,
  fetchImpl,
}: {
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
}): Promise<void> {
  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: "這個 PartsRadarTW bot 版本尚未支援此操作。",
  });
}

async function sendMissingUserResponse({
  interaction,
  options,
  fetchImpl,
}: {
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
}): Promise<void> {
  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: "無法辨識這次操作的 Discord 使用者。",
  });
}

function formatWatchModalValidationMessage(
  modal: NonNullable<ReturnType<typeof parseWatchModalSubmit>>,
): string {
  const messages = [
    modal.action !== "create" || modal.productInputValid
      ? null
      : "請貼上 PartsRadarTW 商品頁完整網址，或輸入網址 `/products/` 後面的商品 ID。",
    modal.targetPriceInputValid
      ? null
      : `目標價格需為 1-${MAX_TARGET_PRICE.toLocaleString("en-US")} 的新台幣整數，請不要輸入 NT$、逗號或空格。`,
  ].filter((message): message is string => message !== null);

  return messages.join("\n");
}

async function readWatchManagerPage({
  client,
  discordUserId,
  page,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  page: number;
}) {
  const result = await readTargetPriceWatchlist({ client, discordUserId, page });

  if (result.watches.length === 0 && result.hasPreviousPage) {
    return readWatchManagerPage({ client, discordUserId, page: page - 1 });
  }

  return result;
}

function extractWatchId(watchInput: string | null): string | null {
  const match = /^watch:([0-9a-f-]{36})$/i.exec(watchInput ?? "");

  return match?.[1] ?? null;
}

async function readPriceReportSettingsPanel({
  client,
  discordUserId,
  notice,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  notice?: string;
}): Promise<{
  setting: Awaited<ReturnType<typeof readPriceReportSetting>>;
  categories: PriceReportCategoryOption[];
  notice?: string;
}> {
  const [setting, categories] = await Promise.all([
    readPriceReportSetting({ client, discordUserId }),
    readPriceReportCategories({ client }),
  ]);

  return {
    setting,
    categories,
    notice,
  };
}

function createPriceReportSettingsPanelMessage({
  setting,
  categories,
  notice,
}: Awaited<ReturnType<typeof readPriceReportSettingsPanel>>): DiscordBotMessage {
  const filters = toPriceReportFilters(setting);
  const summary = formatPriceReportSettingMessage(setting, categories);
  const content = notice ? `**${notice}**\n\n${summary}` : summary;

  return {
    content,
    components: createPriceReportSettingsComponents({
      windowHours: resolveWindowHours(setting?.window),
      categories,
      categoryIgrps: filters.categoryIgrps,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
      enabled: setting?.enabled ?? false,
    }),
  };
}

function parsePriceReportCategorySelection(
  values: string[],
  categories: PriceReportCategoryOption[],
): number[] | null {
  const visibleCategories = categories.slice(0, 25);
  const visibleIgrps = new Set(visibleCategories.map((category) => category.igrp));
  const selectedIgrps = new Set<number>();

  for (const value of values) {
    if (!/^[1-9][0-9]*$/.test(value)) {
      return null;
    }

    const igrp = Number(value);

    if (!visibleIgrps.has(igrp)) {
      return null;
    }

    selectedIgrps.add(igrp);
  }

  if (selectedIgrps.size === 0 || selectedIgrps.size === visibleIgrps.size) {
    return [];
  }

  return [...selectedIgrps].sort((left, right) => left - right);
}

function formatPriceReportModalValidationMessage({
  maxItemsInputValid,
  timeInputValid,
}: {
  maxItemsInputValid: boolean;
  timeInputValid: boolean;
}): string {
  const messages = [
    maxItemsInputValid ? null : `最多商品數需為 1-${MAX_PRICE_REPORT_ITEMS} 的整數。`,
    timeInputValid ? null : "每日發送時間格式需為台北時間 HH:mm，例如 `09:30` 或 `21:00`。",
  ].filter((message): message is string => message !== null);

  return messages.join("\n");
}

function resolveWindowHours(window: string | undefined): number {
  if (window === "HOURS_6") {
    return 6;
  }

  if (window === "HOURS_12") {
    return 12;
  }

  return 24;
}

function resolveTimeOfDay(value: Date | null | undefined): PriceReportTimeOfDay {
  const [hourValue, minuteValue] = formatTaipeiTimeInput(value).split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  return Number.isInteger(hour) && Number.isInteger(minute)
    ? { hour, minute }
    : { hour: 9, minute: 0 };
}

function formatTaipeiTimeInput(value: Date | null | undefined): string {
  if (!value) {
    return "09:00";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("hour")}:${byType.get("minute")}`;
}
