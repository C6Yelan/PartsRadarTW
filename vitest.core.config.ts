// vitest.core.config.ts
// 定義核心測試集合，排除 ops / Discord 長流程測試以維持日常 `pnpm test` 回饋速度。

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "apps/crawler/tests/coolpc/**/*.{test,spec}.{ts,tsx}",
      "apps/crawler/tests/scripts/shared/**/*.{test,spec}.{ts,tsx}",
      "apps/web/tests/api/**/*.{test,spec}.{ts,tsx}",
      "apps/web/tests/build-list/**/*.{test,spec}.{ts,tsx}",
      "apps/web/tests/products/**/*.{test,spec}.{ts,tsx}",
      "packages/**/*.{test,spec}.{ts,tsx}",
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
