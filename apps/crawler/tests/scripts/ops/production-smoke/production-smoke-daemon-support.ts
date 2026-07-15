// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-daemon-support.ts
// 提供 production smoke daemon 測試共用的 webhook 與 shutdown fixtures。

import type { runProductionSmokeDaemon } from "../../../../src/scripts/ops/production-smoke-daemon";

export const DISCORD_ADMIN_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1234567890/token_ABC.def-ghi";

export type SendDiscordWebhook = NonNullable<
  Parameters<typeof runProductionSmokeDaemon>[0]["sendDiscordWebhook"]
>;

// 提供 daemon 測試用的不等待 shutdown controller，讓 run-once 路徑直接完成。
export function idleShutdown() {
  return {
    requested: false,
    sleep: async () => {},
  };
}
