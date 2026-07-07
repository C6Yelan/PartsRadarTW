// apps/crawler/src/scripts/ops/discord-bot/interactions.ts
// 依 Discord interaction type 分派到 slash command、message component 或 modal submit handler。

import {
  DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND,
  DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT,
  DISCORD_INTERACTION_TYPE_MODAL_SUBMIT,
} from "./constants";
import type { CommandCooldowns } from "./cooldowns";
import type {
  DiscordBotClient,
  DiscordBotOptions,
  DiscordInteraction,
  FetchImpl,
} from "./types";
import { handleApplicationCommandInteraction } from "./interactions/application-command";
import { handleMessageComponentInteraction } from "./interactions/message-component";
import { handleModalSubmitInteraction } from "./interactions/modal-submit";

// Gateway 收到 INTERACTION_CREATE 後的統一入口，保留共用 options、cooldown 與 fetch 注入。
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
