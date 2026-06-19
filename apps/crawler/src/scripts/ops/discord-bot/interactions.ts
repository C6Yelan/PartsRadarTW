// apps/crawler/src/scripts/ops/discord-bot/interactions.ts

import {
  DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND,
  DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT,
  DISCORD_INTERACTION_TYPE_MODAL_SUBMIT,
  MAX_PRICE_REPORT_ITEMS,
} from "./constants";
import {
  createPriceReportSettingsComponents,
  createPriceReportSettingsModal,
  parsePriceReportComponentInteraction,
  parsePriceReportInteraction,
  parsePriceReportModalSubmit,
  parseUnwatchComponentInteraction,
  parseUnwatchInteraction,
  parseWatchInteraction,
  parseWatchlistInteraction,
} from "./commands";
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
  sendModalInteractionResponse,
} from "./rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "./types";
import {
  createDisableTargetPriceWatchResponseMessage,
  createTargetPriceWatch,
  createTargetPriceWatchResponseMessage,
  createTargetPriceWatchlistResponseMessage,
  createUnwatchSelectResponseMessage,
  disableTargetPriceWatch,
  readTargetPriceWatchlist,
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
  const watchCommand = command ? null : parseWatchInteraction(interaction);
  const watchlistCommand = command || watchCommand ? false : parseWatchlistInteraction(interaction);
  const unwatchCommand =
    command || watchCommand || watchlistCommand ? null : parseUnwatchInteraction(interaction);

  if (!command && !watchCommand && !watchlistCommand && !unwatchCommand) {
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
    const result = await createTargetPriceWatch({
      client,
      discordUserId,
      productInput: watchCommand.productInput,
      targetPrice: watchCommand.targetPrice,
    });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createTargetPriceWatchResponseMessage({
        result,
        publicBaseUrl: options.publicBaseUrl,
      }),
    });
    return;
  }

  if (watchlistCommand) {
    const result = await readTargetPriceWatchlist({ client, discordUserId });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createTargetPriceWatchlistResponseMessage({
        result,
        publicBaseUrl: options.publicBaseUrl,
      }),
    });
    return;
  }

  if (unwatchCommand) {
    if (!unwatchCommand.watchInput) {
      const result = await readTargetPriceWatchlist({
        client,
        discordUserId,
        maxItems: 25,
      });

      await sendInteractionResponse({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        interaction,
        fetchImpl,
        message: createUnwatchSelectResponseMessage({ result }),
      });
      return;
    }

    const result = await disableTargetPriceWatch({
      client,
      discordUserId,
      watchInput: unwatchCommand.watchInput,
    });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createDisableTargetPriceWatchResponseMessage({
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
  const unwatchComponent = component ? null : parseUnwatchComponentInteraction(interaction);

  if (!component && !unwatchComponent) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendMissingUserResponse({ interaction, options, fetchImpl });
    return;
  }

  if (unwatchComponent) {
    const result = await disableTargetPriceWatch({
      client,
      discordUserId,
      watchInput: unwatchComponent.watchInput,
    });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createDisableTargetPriceWatchResponseMessage({
        result,
        publicBaseUrl: options.publicBaseUrl,
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

  if (!modal) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendMissingUserResponse({ interaction, options, fetchImpl });
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
