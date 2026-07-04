// apps/crawler/src/scripts/ops/discord-bot/types/bot-options.ts

import type { PrismaClient } from "@partsradar/db";
import type { PriceChangeDiscordClient } from "../../price-change-discord-notification";

export interface DiscordBotOptions {
  token: string;
  applicationId: string;
  publicBaseUrl: string;
  apiBaseUrl: string;
  gatewayUrl: string;
  registerCommands: boolean;
  registerCommandsOnStart: boolean;
  priceReportMaxItems: number;
  commandCooldownSeconds: number;
  priceReportScheduleIntervalSeconds: number;
}

export type DiscordBotClient = PriceChangeDiscordClient &
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
