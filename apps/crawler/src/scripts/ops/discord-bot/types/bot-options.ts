// apps/crawler/src/scripts/ops/discord-bot/types/bot-options.ts
// 定義 Discord bot runtime 共用的設定、資料存取 client 與關閉控制 contract。

import type { PrismaClient } from "@partsradar/db";
import type { PriceReportReaderClient } from "@partsradar/db/price-report";

// Discord bot 啟動後傳遞給 gateway、互動 handler、排程與註冊流程的完整設定。
export interface DiscordBotOptions {
  token: string;
  applicationId: string;
  publicBaseUrl: string;
  apiBaseUrl: string;
  gatewayUrl: string;
  adminWebhookUrl: string | null;
  statusGuildId: string | null;
  statusOwnerUserId: string | null;
  registerCommandsOnStart: boolean;
  publicReportsEnabled: boolean;
  personalReportsEnabled: boolean;
  targetWatchesEnabled: boolean;
  commandCooldownSeconds: number;
  priceReportScheduleIntervalSeconds: number;
}

// Discord bot 流程需要的最小資料存取介面，不直接依賴完整 PrismaClient。
export type DiscordBotClient = PriceReportReaderClient &
  Pick<
    PrismaClient,
    | "discordNotificationDelivery"
    | "discordPriceReportSetting"
    | "discordPublicPriceReportDelivery"
    | "discordPublicPriceReportSetting"
    | "discordTargetPriceWatch"
    | "crawlRun"
    | "product"
    | "sourceCategory"
  >;

// daemon 主迴圈使用的關閉控制介面，統一停止狀態與可中斷 sleep。
export interface ShutdownController {
  readonly requested: boolean;
  onStop(callback: () => void): void;
  sleep(ms: number): Promise<void>;
}

// 使用者指令 cooldown 判斷結果，供互動 handler 決定是否立即回覆或提示等待。
export interface CommandCooldownResult {
  allowed: boolean;
  retryAfterSeconds: number;
}
