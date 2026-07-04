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
