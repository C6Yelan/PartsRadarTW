// apps/crawler/src/scripts/ops/discord-bot/commands/submitted-components.ts

import type { DiscordInteractionComponent } from "../types";

export function readSubmittedComponentValue(
  components: DiscordInteractionComponent[] | undefined,
  customId: string,
): unknown {
  for (const component of components ?? []) {
    if (component.custom_id === customId) {
      return component.values?.[0] ?? component.value;
    }

    if (component.component) {
      const value = readSubmittedComponentValue([component.component], customId);

      if (value !== undefined) {
        return value;
      }
    }

    const value = readSubmittedComponentValue(component.components, customId);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}
