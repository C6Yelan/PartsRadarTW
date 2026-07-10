// vitest.ops.config.ts
// 定義 crawler 維運腳本測試集合，並排除 Discord bot 專屬測試。

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/crawler/tests/scripts/ops/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/out/**",
      "apps/web/e2e/**",
      "apps/crawler/tests/scripts/ops/discord-bot/**/*.{test,spec}.{ts,tsx}",
      "apps/crawler/tests/scripts/ops/discord-bot-*.{test,spec}.{ts,tsx}",
    ],
  },
});
