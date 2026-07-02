// apps/crawler/src/scripts/ops/discord-bot/interactions.ts

import {
  createPriceReportKeywordModal,
  createPriceReportSettingsComponents,
  createPriceReportTimeLimitModal,
  createPublicReportKeywordModal,
  createPublicReportLimitModal,
  createPublicReportSettingsComponents,
  createWatchEditModal,
  createWatchModal,
  parsePriceReportComponentInteraction,
  parsePriceReportInteraction,
  parsePriceReportModalSubmit,
  parsePublicReportComponentInteraction,
  parsePublicReportInteraction,
  parsePublicReportModalSubmit,
  parseWatchComponentInteraction,
  parseWatchInteraction,
  parseWatchModalSubmit,
} from "./commands";
import {
  DISCORD_EMBED_COLOR,
  DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND,
  DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT,
  DISCORD_INTERACTION_TYPE_MODAL_SUBMIT,
  DISCORD_PERMISSION_EMBED_LINKS,
  DISCORD_PERMISSION_SEND_MESSAGES,
  MAX_PRICE_REPORT_ITEMS,
  MAX_PRICE_REPORT_KEYWORD_GROUPS,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
  MAX_TARGET_PRICE,
} from "./constants";
import type { CommandCooldowns } from "./cooldowns";
import {
  disablePriceReport,
  enableDailyPriceReport,
  formatPriceReportCategoryFilterLabel,
  formatPriceReportEventFilterLabel,
  formatPriceReportKeywordFilterLabel,
  formatTaipeiMinute,
  formatWindowLabel,
  type PriceReportCategoryOption,
  type PriceReportDeliveryStatus,
  readLatestScheduledPriceReportDelivery,
  readPriceReportCategories,
  readPriceReportSetting,
  sendPriceReportNow,
  toPriceReportFilters,
} from "./price-report";
import {
  clearPublicPriceReportSetting,
  type PublicPriceReportDeliveryStatus,
  type PublicPriceReportPreviewResult,
  type PublicPriceReportSetting,
  readLatestPublicPriceReportDelivery,
  readPublicPriceReportSetting,
  sendPublicPriceReportPreview,
  setPublicPriceReportChannel,
  setPublicPriceReportEnabled,
  toPublicPriceReportFilters,
  updatePublicPriceReportFilters,
} from "./public-price-report";
import {
  deferInteractionMessageUpdate,
  deferInteractionResponse,
  editDeferredInteractionResponse,
  formatDiscordBotText,
  formatDiscordDeliveryFailureForUser,
  formatDiscordRateLimitForUser,
  sendDiscordDirectMessages,
  sendDiscordChannelMessages,
  sendDiscordInteractionMessages,
  sendInteractionResponse,
  sendModalInteractionResponse,
} from "./rest";
import type {
  DiscordBotClient,
  DiscordBotEmbed,
  DiscordBotMessage,
  DiscordBotOptions,
  DiscordInteraction,
  FetchImpl,
  PriceReportNowResult,
  PriceReportTimeOfDay,
} from "./types";
import {
  createTargetPriceWatch,
  createTargetPriceWatchBulkRemovalMessage,
  createTargetPriceWatchManagerMessage,
  createTargetPriceWatchRemovalConfirmationMessage,
  createTargetPriceWatchResponseMessage,
  disableTargetPriceWatch,
  disableTargetPriceWatches,
  readLatestTargetPriceWatchDelivery,
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
      cooldowns,
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
  const publicReportCommand =
    command || watchCommand ? null : parsePublicReportInteraction(interaction);

  if (!command && !watchCommand && !publicReportCommand) {
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
      options,
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

  if (publicReportCommand) {
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

    if (publicReportCommand.name === "test") {
      await sendPublicReportTest({
        client,
        interaction,
        options,
        cooldowns,
        fetchImpl,
        discordUserId,
        publicContext,
        missingSettingMessage: "尚未設定公開報告頻道，請先使用 `/public-report manage` 設定。",
      });
      return;
    }

    const panel = await readPublicPriceReportSettingsPanel({
      client,
      discordGuildId: publicContext.discordGuildId,
      currentChannelId: publicContext.channelId,
      options,
    });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message:
        publicReportCommand.name === "status"
          ? createPublicPriceReportStatusMessage(panel)
          : createPublicPriceReportSettingsPanelMessage(panel),
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
      message: await createTargetPriceWatchManagerMessageWithDelivery({
        client,
        discordUserId,
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
  cooldowns,
  fetchImpl,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  cooldowns: CommandCooldowns;
  fetchImpl: FetchImpl;
}): Promise<void> {
  const component = parsePriceReportComponentInteraction(interaction);
  const publicReportComponent = component
    ? null
    : parsePublicReportComponentInteraction(interaction);
  const watchComponent =
    component || publicReportComponent ? null : parseWatchComponentInteraction(interaction);

  if (!component && !publicReportComponent && !watchComponent) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendMissingUserResponse({ interaction, options, fetchImpl });
    return;
  }

  if (publicReportComponent) {
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

    if (publicReportComponent.name === "open_keyword_modal") {
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

    if (publicReportComponent.name === "open_limit_modal") {
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

    if (publicReportComponent.name === "preview") {
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

    if (publicReportComponent.name === "set_channel") {
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
    } else if (publicReportComponent.name === "enable") {
      const setting = await setPublicPriceReportEnabled({
        client,
        discordGuildId: publicContext.discordGuildId,
        channelId: publicContext.channelId,
        discordUserId,
        enabled: true,
      });
      notice = `已啟用公開價格報告，發送頻道為 <#${setting.channelId}>。`;
    } else if (publicReportComponent.name === "disable") {
      const setting = await setPublicPriceReportEnabled({
        client,
        discordGuildId: publicContext.discordGuildId,
        channelId: publicContext.channelId,
        discordUserId,
        enabled: false,
      });
      notice = `已暫停公開價格報告，設定頻道保留為 <#${setting.channelId}>。`;
    } else if (publicReportComponent.name === "clear") {
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
        publicReportComponent.name === "update_categories"
          ? parsePriceReportCategorySelection(publicReportComponent.values, currentPanel.categories)
          : publicReportComponent.name === "update_all_categories"
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
          publicReportComponent.name === "update_events"
            ? publicReportComponent.includePriceDrops
            : currentFilters.includePriceDrops,
        includePriceRises:
          publicReportComponent.name === "update_events"
            ? publicReportComponent.includePriceRises
            : currentFilters.includePriceRises,
        includeNewProducts:
          publicReportComponent.name === "update_events"
            ? publicReportComponent.includeNewProducts
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
    return;
  }

  if (component?.name === "preview_report") {
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
        message: await createTargetPriceWatchManagerMessageWithDelivery({
          client,
          discordUserId,
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

    if (watchComponent.action === "bulk_remove") {
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
        message: createTargetPriceWatchBulkRemovalMessage({
          result,
          page: watchComponent.page,
        }),
      });
      return;
    }

    if (watchComponent.action === "bulk_remove_select") {
      const disabled = await disableTargetPriceWatches({
        client,
        discordUserId,
        watchInputs: watchComponent.watchInputs,
      });
      const result = await readWatchManagerPage({
        client,
        discordUserId,
        page: watchComponent.page,
      });
      const notice =
        disabled.disabledCount > 0
          ? `已批次移除 ${disabled.disabledCount} 項目標價追蹤。`
          : "選取的追蹤已不存在，清單已重新整理。";

      await editDeferredInteractionResponse({
        token: options.token,
        applicationId: options.applicationId,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: await createTargetPriceWatchManagerMessageWithDelivery({
          client,
          discordUserId,
          result,
          publicBaseUrl: options.publicBaseUrl,
          notice,
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
      message: await createTargetPriceWatchManagerMessageWithDelivery({
        client,
        discordUserId,
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

  if (component?.name === "open_keyword_modal") {
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

  if (component?.name === "disable_daily_report") {
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
      productKeyword: currentFilters.productKeyword,
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
  const publicReportModal = modal || watchModal ? null : parsePublicReportModalSubmit(interaction);

  if (!modal && !watchModal && !publicReportModal) {
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
        message: await createTargetPriceWatchManagerMessageWithDelivery({
          client,
          discordUserId,
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
        message: await createTargetPriceWatchManagerMessageWithDelivery({
          client,
          discordUserId,
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

  if (publicReportModal) {
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
    await enableDailyPriceReport({
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
  const setting = await enableDailyPriceReport({
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

async function createTargetPriceWatchManagerMessageWithDelivery({
  client,
  discordUserId,
  result,
  publicBaseUrl,
  selectedWatchInput = null,
  notice,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  result: Awaited<ReturnType<typeof readWatchManagerPage>>;
  publicBaseUrl: string;
  selectedWatchInput?: string | null;
  notice?: string;
}): Promise<DiscordBotMessage> {
  const selectedWatchId = extractWatchId(selectedWatchInput);
  const selectedWatchDelivery =
    selectedWatchId && result.watches.some((watch) => watch.id === selectedWatchId)
      ? await readLatestTargetPriceWatchDelivery({
          client,
          discordUserId,
          watchId: selectedWatchId,
        })
      : null;

  return createTargetPriceWatchManagerMessage({
    result,
    publicBaseUrl,
    selectedWatchInput,
    selectedWatchDelivery,
    notice,
  });
}

function extractWatchId(watchInput: string | null): string | null {
  const match = /^watch:([0-9a-f-]{36})$/i.exec(watchInput ?? "");

  return match?.[1] ?? null;
}

function readPublicReportInteractionContext(
  interaction: DiscordInteraction,
): { discordGuildId: string; channelId: string } | null {
  const discordGuildId = interaction.guild_id?.trim();
  const channelId = interaction.channel_id?.trim();

  return discordGuildId && channelId ? { discordGuildId, channelId } : null;
}

async function sendPublicReportTest({
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
  publicContext: { discordGuildId: string; channelId: string };
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
    maxItems: Math.min(setting.maxItems, options.priceReportMaxItems),
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

  await editDeferredInteractionResponse({
    token: options.token,
    applicationId: options.applicationId,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: formatPublicReportPreviewNotice(previewResult, setting.channelId),
  });
}

function formatPublicReportBotPermissionNotice(
  interaction: DiscordInteraction,
  channelId: string,
): string | null {
  const appPermissions = interaction.app_permissions?.trim();

  if (!appPermissions) {
    return null;
  }

  const missing = [
    hasDiscordPermission(appPermissions, DISCORD_PERMISSION_SEND_MESSAGES) ? null : "傳送訊息",
    hasDiscordPermission(appPermissions, DISCORD_PERMISSION_EMBED_LINKS) ? null : "嵌入連結",
  ].filter((permission): permission is string => permission !== null);

  if (missing.length === 0) {
    return null;
  }

  return `我目前無法在 <#${channelId}> 發送公開價格報告。請確認 PartsRadarTW bot 在該頻道具備「${missing.join("」與「")}」權限。`;
}

function hasDiscordPermission(value: string | undefined, permission: bigint): boolean {
  const bitset = parseDiscordPermissionBitset(value);

  return bitset !== null && (bitset & permission) === permission;
}

function parseDiscordPermissionBitset(value: string | undefined): bigint | null {
  if (!value || !/^(0|[1-9][0-9]*)$/.test(value)) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

async function readPublicPriceReportSettingsPanel({
  client,
  discordGuildId,
  currentChannelId,
  options,
  notice,
}: {
  client: DiscordBotClient;
  discordGuildId: string;
  currentChannelId: string;
  options: DiscordBotOptions;
  notice?: string;
}): Promise<{
  setting: PublicPriceReportSetting | null;
  latestDelivery: PublicPriceReportDeliveryStatus | null;
  categories: PriceReportCategoryOption[];
  options: DiscordBotOptions;
  currentChannelId: string;
  notice?: string;
}> {
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
    options,
    currentChannelId,
    notice,
  };
}

function createPublicPriceReportSettingsPanelMessage({
  setting,
  latestDelivery,
  categories,
  options,
  currentChannelId,
  notice,
}: Awaited<ReturnType<typeof readPublicPriceReportSettingsPanel>>): DiscordBotMessage {
  const filters = toPublicPriceReportFilters(setting);

  return {
    embeds: [
      createPublicPriceReportSettingsEmbed({
        setting,
        latestDelivery,
        categories,
        options,
        currentChannelId,
        notice,
      }),
    ],
    components: createPublicReportSettingsComponents({
      hasChannel: setting !== null,
      enabled: setting?.enabled ?? false,
      categories,
      categoryIgrps: filters.categoryIgrps,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
    }),
  };
}

function createPublicPriceReportStatusMessage(
  panel: Awaited<ReturnType<typeof readPublicPriceReportSettingsPanel>>,
): DiscordBotMessage {
  return {
    embeds: [
      createPublicPriceReportSettingsEmbed({
        ...panel,
        title: "公開價格報告狀態",
        description: "目前公開價格報告的設定與最近一次發送紀錄。",
      }),
    ],
  };
}

function createPublicPriceReportSettingsEmbed({
  setting,
  latestDelivery,
  categories,
  options,
  currentChannelId,
  notice,
  title = "公開價格報告設定",
  description:
    baseDescription = "公開價格報告會在排程爬蟲完成且有符合設定的價格變動或新增商品時，自動發送到指定頻道。",
}: Awaited<ReturnType<typeof readPublicPriceReportSettingsPanel>> & {
  title?: string;
  description?: string;
}): DiscordBotEmbed {
  const filters = toPublicPriceReportFilters(setting);
  const description = [notice ? `**${notice}**` : null, baseDescription]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    title,
    description,
    color: DISCORD_EMBED_COLOR,
    fields: [
      {
        name: "狀態",
        value: setting ? (setting.enabled ? "已啟用" : "已暫停") : "尚未設定",
        inline: true,
      },
      {
        name: "發送頻道",
        value: setting ? `<#${setting.channelId}>` : "尚未設定",
        inline: true,
      },
      {
        name: "目前頻道",
        value: `<#${currentChannelId}>`,
        inline: true,
      },
      {
        name: "分類",
        value: formatPriceReportCategoryFilterLabel(filters, categories),
        inline: true,
      },
      {
        name: "內容",
        value: formatPriceReportEventFilterLabel(filters),
        inline: true,
      },
      {
        name: "最多列出",
        value: `${setting?.maxItems ?? options.priceReportMaxItems} 筆`,
        inline: true,
      },
      {
        name: "商品關鍵字",
        value: formatPriceReportKeywordFilterLabel(filters),
        inline: true,
      },
      {
        name: "最近一次公開報告",
        value: formatPublicReportDeliveryStatus(latestDelivery),
      },
    ],
  };
}

function formatPublicReportDeliveryStatus(
  delivery: PublicPriceReportDeliveryStatus | null,
): string {
  if (!delivery) {
    return "尚無公開報告紀錄。";
  }

  const deliveredAt = formatTaipeiMinute(delivery.deliveredAt ?? delivery.createdAt);

  if (delivery.status === "SENT") {
    return `成功：${deliveredAt}，列出 ${delivery.itemCount} 筆，送出 ${delivery.messageCount} 則訊息。`;
  }

  if (delivery.status === "SKIPPED") {
    return `略過：${deliveredAt}，本輪沒有符合設定的公開報告內容。`;
  }

  if (delivery.status === "RATE_LIMITED") {
    return `Discord 限流：${deliveredAt}。${formatDiscordRateLimitForUser()}`;
  }

  if (delivery.status === "FAILED") {
    return `失敗：${deliveredAt}。${formatPriceReportDeliveryError(delivery.errorMessage)}`;
  }

  return `${delivery.status}：${deliveredAt}，列出 ${delivery.itemCount} 筆。`;
}

function formatPublicReportPreviewNotice(
  result: PublicPriceReportPreviewResult,
  channelId: string,
): string {
  if (result.status === "sent") {
    return `已發送測試公開報告到 <#${channelId}>：列出 ${result.listedCount} 筆，送出 ${result.messageCount} 則訊息。`;
  }

  if (result.status === "skipped") {
    return "過去 24 小時沒有符合設定的公開報告內容，未發送測試報告。";
  }

  if (result.status === "rate_limited") {
    return formatDiscordRateLimitForUser();
  }

  if (isDiscordMissingPermissionsError(result.message)) {
    return `我目前無法在 <#${channelId}> 發送公開價格報告。請確認 PartsRadarTW bot 在該頻道具備「傳送訊息」與「嵌入連結」權限。`;
  }

  return formatDiscordDeliveryFailureForUser(result.message);
}

function isDiscordMissingPermissionsError(message: string | null): boolean {
  const normalized = message?.toLowerCase() ?? "";

  return normalized.includes("code=50013") || normalized.includes("missing permissions");
}

async function readPriceReportSettingsPanel({
  client,
  discordUserId,
  options,
  notice,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  options: DiscordBotOptions;
  notice?: string;
}): Promise<{
  setting: Awaited<ReturnType<typeof readPriceReportSetting>>;
  categories: PriceReportCategoryOption[];
  latestDelivery: PriceReportDeliveryStatus | null;
  options: DiscordBotOptions;
  notice?: string;
}> {
  const [setting, categories, latestDelivery] = await Promise.all([
    readPriceReportSetting({ client, discordUserId }),
    readPriceReportCategories({ client }),
    readLatestScheduledPriceReportDelivery({ client, discordUserId }),
  ]);

  return {
    setting,
    categories,
    latestDelivery,
    options,
    notice,
  };
}

function createPriceReportSettingsPanelMessage({
  setting,
  categories,
  latestDelivery,
  options,
  notice,
}: Awaited<ReturnType<typeof readPriceReportSettingsPanel>>): DiscordBotMessage {
  const filters = toPriceReportFilters(setting);

  return {
    embeds: [
      createPriceReportSettingsEmbed({ setting, categories, latestDelivery, options, notice }),
    ],
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

function createPriceReportSettingsEmbed({
  setting,
  categories,
  latestDelivery,
  options,
  notice,
}: Awaited<ReturnType<typeof readPriceReportSettingsPanel>>): DiscordBotEmbed {
  const enabled = setting?.enabled ?? false;
  const filters = toPriceReportFilters(setting);
  const description = [
    notice ? `**${notice}**` : null,
    enabled ? "每日價格提醒已開啟。" : "尚未開啟每日價格提醒。",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    title: "價格報告設定",
    description,
    color: DISCORD_EMBED_COLOR,
    fields: [
      {
        name: "統計區間",
        value: setting ? formatWindowLabel(setting.window) : "過去 24 小時",
        inline: true,
      },
      {
        name: "分類",
        value: formatPriceReportCategoryFilterLabel(filters, categories),
        inline: true,
      },
      {
        name: "內容",
        value: formatPriceReportEventFilterLabel(filters),
        inline: true,
      },
      {
        name: "商品關鍵字",
        value: formatPriceReportKeywordFilterLabel(filters),
        inline: true,
      },
      {
        name: "每次最多",
        value: `${setting?.maxItems ?? options.priceReportMaxItems} 筆`,
        inline: true,
      },
      {
        name: "每日時間",
        value: formatTaipeiTimeInput(setting?.nextSendAt),
        inline: true,
      },
      {
        name: "下一次",
        value: enabled && setting ? formatTaipeiMinute(setting.nextSendAt) : "啟用後排程",
        inline: true,
      },
      {
        name: "最近一次每日報告",
        value: formatPriceReportDeliveryStatus(latestDelivery),
      },
    ],
  };
}

function formatPriceReportDeliveryStatus(delivery: PriceReportDeliveryStatus | null): string {
  if (!delivery) {
    return "尚無每日報告紀錄。";
  }

  const deliveredAt = formatTaipeiMinute(delivery.deliveredAt ?? delivery.createdAt);

  if (delivery.status === "SENT") {
    return `成功：${deliveredAt}，列出 ${delivery.itemCount} 筆，送出 ${delivery.messageCount} 則訊息。`;
  }

  if (delivery.status === "RATE_LIMITED") {
    return `Discord 限流：${deliveredAt}。${formatDiscordRateLimitForUser()}`;
  }

  if (delivery.status === "FAILED") {
    return `失敗：${deliveredAt}。${formatPriceReportDeliveryError(delivery.errorMessage)}`;
  }

  return `${delivery.status}：${deliveredAt}，列出 ${delivery.itemCount} 筆。`;
}

function formatPriceReportPreviewDmNotice(result: PriceReportNowResult): string {
  if (result.status === "sent") {
    return `已傳送預覽 DM：列出 ${result.listedCount} 筆，送出 ${result.messageCount} 則訊息。`;
  }

  if (result.status === "rate_limited") {
    return formatDiscordRateLimitForUser();
  }

  return formatDiscordDeliveryFailureForUser(result.message);
}

function formatPriceReportDeliveryError(errorMessage: string | null): string {
  return formatDiscordBotText(formatDiscordDeliveryFailureForUser(errorMessage), 220);
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

function formatPriceReportModalValidationMessage(
  modal: NonNullable<ReturnType<typeof parsePriceReportModalSubmit>>,
): string {
  if (modal.name === "keyword") {
    return formatPriceReportKeywordValidationMessage();
  }

  const messages = [
    modal.maxItemsInputValid ? null : `最多商品數需為 1-${MAX_PRICE_REPORT_ITEMS} 的整數。`,
    modal.timeInputValid ? null : "每日發送時間格式需為台北時間 HH:mm，例如 `09:30` 或 `21:00`。",
  ].filter((message): message is string => message !== null);

  return messages.join("\n");
}

function formatPriceReportKeywordValidationMessage(): string {
  return `商品關鍵字最多 ${MAX_PRICE_REPORT_KEYWORD_LENGTH} 個字，且最多 ${MAX_PRICE_REPORT_KEYWORD_GROUPS} 組。`;
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
