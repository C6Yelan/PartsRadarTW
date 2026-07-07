// apps/crawler/src/scripts/ops/discord-bot/cli-error.ts
// 提供 Discord bot CLI 入口使用的錯誤訊息遮蔽格式化邊界。

import { toSafeCliErrorMessage } from "../../shared/script-utils";

// 將 Discord bot 啟動錯誤轉成可輸出的安全訊息，避免 token、連線字串等敏感值外流。
export function formatDiscordBotCliError(error: unknown): string {
  return toSafeCliErrorMessage(error);
}
