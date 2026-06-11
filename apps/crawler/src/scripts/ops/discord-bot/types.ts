// apps/crawler/src/scripts/ops/discord-bot/types.ts

import type { PrismaClient } from "@partsradar/db";
import type { PriceChangeDiscordClient } from "../price-change-discord-notification";

export type FetchImpl = typeof fetch;

export interface DiscordBotOptions {
  token: string;
  applicationId: string;
  guildId: string | null;
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
  Pick<PrismaClient, "discordNotificationDelivery" | "discordPriceReportSetting">;

export interface DiscordBotEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordBotEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordBotEmbedField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
}

export interface DiscordBotMessage {
  content?: string;
  embeds?: DiscordBotEmbed[];
}

export type DiscordDirectMessageSendResult =
  | {
      status: "sent";
      messageCount: number;
      httpStatuses: number[];
    }
  | {
      status: "rate_limited";
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

export type DiscordBotMessageSendResult = DiscordDirectMessageSendResult;

export type PriceReportNowResult =
  | {
      status: "sent";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
    }
  | {
      status: "rate_limited";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

export interface DiscordRestOptions {
  token: string;
  apiBaseUrl: string;
  fetchImpl?: FetchImpl;
}

export type DiscordRestResult<T> =
  | {
      status: "ok";
      httpStatus: number;
      body: T | null;
    }
  | {
      status: "rate_limited";
      httpStatus: 429;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      httpStatus: number | null;
      message: string;
      retryAfterMs?: number;
    };

export interface DiscordGatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

export interface DiscordInteraction {
  id: string;
  token: string;
  type: number;
  data?: {
    name?: string;
    options?: DiscordInteractionOption[];
  };
  member?: {
    user?: DiscordUser;
  };
  user?: DiscordUser;
}

export interface DiscordInteractionOption {
  type: number;
  name: string;
  value?: unknown;
  options?: DiscordInteractionOption[];
}

export interface DiscordUser {
  id: string;
}

export interface DiscordDirectMessageChannel {
  id?: unknown;
}

export interface MinimalWebSocketEvent {
  data?: unknown;
}

export interface MinimalWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: MinimalWebSocketEvent) => void,
  ): void;
}

export type MinimalWebSocketConstructor = new (url: string) => MinimalWebSocket;

export interface ShutdownController {
  readonly requested: boolean;
  onStop(callback: () => void): void;
  sleep(ms: number): Promise<void>;
}

export interface CommandCooldownResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface PriceReportTimeOfDay {
  hour: number;
  minute: number;
}

export type ParsedPriceReportCommand =
  | {
      name: "now";
      windowHours: number;
      maxItems: number | null;
    }
  | {
      name: "enable";
      windowHours: number;
      maxItems: number | null;
      timeOfDay: PriceReportTimeOfDay | null;
      timeInputValid: boolean;
    }
  | {
      name: "disable";
    }
  | {
      name: "settings";
    };
