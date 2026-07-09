// vitest.discord.config.ts
// 定義 Discord bot 指令、互動、報告與通知流程的專用測試集合。

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "apps/crawler/tests/scripts/ops/discord-bot/**/*.{test,spec}.{ts,tsx}",
      "apps/crawler/tests/scripts/ops/discord-bot-*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/out/**",
      "apps/web/e2e/**",
    ],
  },
});
