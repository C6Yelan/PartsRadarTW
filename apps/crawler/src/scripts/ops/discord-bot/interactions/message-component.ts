// apps/crawler/src/scripts/ops/discord-bot/interactions/message-component.ts

import {
  parsePriceReportComponentInteraction,
  parsePublicReportComponentInteraction,
  parseWatchComponentInteraction,
} from "../commands";
import type { CommandCooldowns } from "../cooldowns";
import type {
  DiscordBotClient,
  DiscordBotOptions,
  DiscordInteraction,
  FetchImpl,
} from "../types";
import { handlePriceReportComponentInteraction } from "./price-report-handler";
import { handlePublicReportComponentInteraction } from "./public-report-handler";
import {
  sendFeatureDisabledResponse,
  sendMissingUserResponse,
  sendUnsupportedInteractionResponse,
} from "./responses";
import { handleWatchComponentInteraction } from "./watch-handler";

export async function handleMessageComponentInteraction({
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
    if (!options.publicReportsEnabled) {
      await sendFeatureDisabledResponse({
        interaction,
        options,
        fetchImpl,
        content: "公開價格報告目前已由維運暫停。",
      });
      return;
    }

    await handlePublicReportComponentInteraction({
      client,
      interaction,
      options,
      cooldowns,
      fetchImpl,
      discordUserId,
      component: publicReportComponent,
    });
    return;
  }

  if (component) {
    if (!options.personalReportsEnabled) {
      await sendFeatureDisabledResponse({
        interaction,
        options,
        fetchImpl,
        content: "個人價格報告目前已由維運暫停。",
      });
      return;
    }

    await handlePriceReportComponentInteraction({
      client,
      interaction,
      options,
      cooldowns,
      fetchImpl,
      discordUserId,
      component,
    });
    return;
  }

  if (watchComponent) {
    if (!options.targetWatchesEnabled) {
      await sendFeatureDisabledResponse({
        interaction,
        options,
        fetchImpl,
        content: "目標價提醒目前已由維運暫停。",
      });
      return;
    }

    await handleWatchComponentInteraction({
      client,
      interaction,
      options,
      fetchImpl,
      discordUserId,
      component: watchComponent,
    });
    return;
  }

  await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
}
