// apps/crawler/tests/scripts/ops/discord-bot/support-options.ts
// 提供 Discord bot 測試共用的固定 id、分類 fixture 與預設 bot options。
import type { DiscordBotOptions } from "../../../../src/scripts/ops/discord-bot/types";

export const TOKEN = "test_bot_token";
export const APPLICATION_ID = "123456789012345678";
export const API_BASE_URL = "https://discord.test/api/v10";
export const PUBLIC_BASE_URL = "https://partsradar.test/";
export const WATCH_PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
export const WATCH_ROW_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_SOURCE_CATEGORIES = [
  { igrp: 4, displayName: "CPU" },
  { igrp: 5, displayName: "主機板" },
  { igrp: 6, displayName: "記憶體" },
  { igrp: 7, displayName: "SSD / HDD" },
  { igrp: 12, displayName: "顯示卡" },
] as const;

// 建立 Discord bot 測試用 options，允許個別案例覆寫 feature flags 或限制值。
export function createDiscordBotOptions(
  overrides: Partial<DiscordBotOptions> = {},
): DiscordBotOptions {
  return {
    token: TOKEN,
    applicationId: APPLICATION_ID,
    publicBaseUrl: PUBLIC_BASE_URL,
    apiBaseUrl: API_BASE_URL,
    gatewayUrl: "wss://discord.test/gateway",
    registerCommandsOnStart: true,
    publicReportsEnabled: true,
    personalReportsEnabled: true,
    targetWatchesEnabled: true,
    commandCooldownSeconds: 60,
    priceReportScheduleIntervalSeconds: 300,
    ...overrides,
  };
}
