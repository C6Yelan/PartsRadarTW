// apps/crawler/src/scripts/ops/discord-bot/interactions/application-command.ts
// 分派 Discord slash command interaction，協調功能開關、使用者識別、冷卻限制與各功能 handler。

import {
  parseBotInteraction,
  parsePriceReportInteraction,
  parsePublicReportInteraction,
  parseWatchInteraction,
} from "../commands";
import type { CommandCooldowns } from "../cooldowns";
import { readPriceReportSetting, sendPriceReportNow, toPriceReportFilters } from "../price-report";
import {
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendDiscordInteractionMessages,
  sendInteractionResponse,
} from "../rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";
import { createBotHelpMessage } from "./bot-help";
import {
  createPriceReportSettingsPanelMessage,
  readPriceReportSettingsPanel,
  resolveWindowHours,
} from "./price-report-settings";
import {
  createPublicPriceReportSettingsPanelMessage,
  createPublicPriceReportStatusMessage,
  readPublicPriceReportSettingsPanel,
  readPublicReportInteractionContext,
  sendPublicReportTest,
} from "./public-report-settings";
import {
  sendFeatureDisabledResponse,
  sendMissingUserResponse,
  sendUnsupportedInteractionResponse,
} from "./responses";
import {
  createTargetPriceWatchManagerMessageWithDelivery,
  readTargetPriceWatchManagerPage,
} from "./watch-manager";

// 處理 slash command 入口，依 /bot、/price-report、/public-report、/watch 分派到對應互動流程。
export async function handleApplicationCommandInteraction({
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
  const botCommand = parseBotInteraction(interaction);
  const command = parsePriceReportInteraction(interaction);
  const watchCommand = command || botCommand ? false : parseWatchInteraction(interaction);
  const publicReportCommand =
    command || watchCommand || botCommand ? null : parsePublicReportInteraction(interaction);

  if (!botCommand && !command && !watchCommand && !publicReportCommand) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  if (botCommand === "help") {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createBotHelpMessage(),
    });
    return;
  }

  if (command && !options.personalReportsEnabled) {
    await sendFeatureDisabledResponse({
      interaction,
      options,
      fetchImpl,
      featureName: command.name === "now" ? "即時價格報告" : "每日私訊價格報告",
    });
    return;
  }

  if (publicReportCommand && !options.publicReportsEnabled) {
    await sendFeatureDisabledResponse({
      interaction,
      options,
      fetchImpl,
      featureName: "公開價格報告",
    });
    return;
  }

  if (watchCommand && !options.targetWatchesEnabled) {
    await sendFeatureDisabledResponse({
      interaction,
      options,
      fetchImpl,
      featureName: "目標價提醒",
    });
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

    const result = await readTargetPriceWatchManagerPage({ client, discordUserId, page: 0 });

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
