// apps/crawler/src/scripts/ops/discord-bot/types/bot-options.ts

import type { PrismaClient } from "@partsradar/db";
import type { PriceReportReaderClient } from "../price-report/reader-types";

export interface DiscordBotOptions {
  token: string;
  applicationId: string;
  publicBaseUrl: string;
  apiBaseUrl: string;
  gatewayUrl: string;
  registerCommands: boolean;
  registerCommandsOnStart: boolean;
  publicReportsEnabled: boolean;
  personalReportsEnabled: boolean;
  targetWatchesEnabled: boolean;
  priceReportMaxItems: number;
  commandCooldownSeconds: number;
  priceReportScheduleIntervalSeconds: number;
}

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

export interface ShutdownController {
  readonly requested: boolean;
  onStop(callback: () => void): void;
  sleep(ms: number): Promise<void>;
}

export interface CommandCooldownResult {
  allowed: boolean;
  retryAfterSeconds: number;
}
