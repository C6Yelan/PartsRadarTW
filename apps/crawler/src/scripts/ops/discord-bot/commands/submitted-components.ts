// apps/crawler/src/scripts/ops/discord-bot/commands/submitted-components.ts
// 從 Discord modal submit 的巢狀 component tree 讀取指定 custom_id 的使用者輸入值。

import type { DiscordInteractionComponent } from "../types";

// 遞迴搜尋 action row、label component 與巢狀 components，支援文字輸入與 select value 的共用讀取。
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
