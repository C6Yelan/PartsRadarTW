// apps/crawler/src/scripts/ops/discord-bot/commands/submitted-components.ts
// 從 Discord modal submit 的巢狀 component tree 讀取指定 custom_id 的使用者輸入值。

import type { DiscordInteractionComponent } from "../types";

// 搜尋目前 Discord modal 的 label component，讀取內層 input 的文字或 select value。
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
  }

  return undefined;
}
