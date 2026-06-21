// apps/crawler/src/scripts/ops/discord-bot/interactions.ts

import {
  createPriceReportSettingsComponents,
  createPriceReportSettingsModal,
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
  formatWindowLabel,
  readPriceReportSetting,
  sendPriceReportNow,
} from "./price-report";
import {
  deferInteractionMessageUpdate,
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendDiscordInteractionMessages,
  sendInteractionResponse,
  sendModalInteractionResponse,
} from "./rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "./types";
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

    const setting = await readPriceReportSetting({ client, discordUserId });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: {
        content: formatPriceReportSettingMessage(setting),
        components: createPriceReportSettingsComponents(),
      },
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

  if (component?.name === "open_settings_modal") {
    const setting = await readPriceReportSetting({ client, discordUserId });

    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createPriceReportSettingsModal({
        windowHours: resolveWindowHours(setting?.window),
        maxItems: setting?.maxItems ?? options.priceReportMaxItems,
        timeValue: formatTaipeiTimeInput(setting?.nextSendAt),
      }),
    });
    return;
  }

  const disabledCount = await disablePriceReport({ client, discordUserId });

  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: disabledCount > 0 ? "已關閉每日價格提醒。" : "目前沒有開啟每日價格提醒。",
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

  if (!modal.windowInputValid || !modal.maxItemsInputValid || !modal.timeInputValid) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: formatPriceReportModalValidationMessage(modal),
    });
    return;
  }

  const setting = await enableDailyPriceReport({
    client,
    discordUserId,
    windowHours: modal.windowHours,
    maxItems: modal.maxItems ?? options.priceReportMaxItems,
    timeOfDay: modal.timeOfDay,
  });

  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: `已開啟每日價格提醒。報告會以私訊發送，區間：${formatWindowLabel(setting.window)}，上限：${setting.maxItems} 筆，下一次：${formatTaipeiMinute(setting.nextSendAt)}。`,
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

function formatPriceReportModalValidationMessage({
  windowInputValid,
  maxItemsInputValid,
  timeInputValid,
}: {
  windowInputValid: boolean;
  maxItemsInputValid: boolean;
  timeInputValid: boolean;
}): string {
  const messages = [
    windowInputValid ? null : "統計區間需為 `24h`、`12h` 或 `6h`。",
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
