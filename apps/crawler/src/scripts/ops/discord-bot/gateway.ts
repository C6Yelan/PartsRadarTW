// apps/crawler/src/scripts/ops/discord-bot/gateway.ts
// 管理 Discord Gateway WebSocket session，處理 identify、heartbeat、互動事件與關閉流程。

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import { createInterruptibleShutdownController } from "../shared/shutdown";
import {
  DISCORD_ACTIVITY_TYPE_WATCHING,
  GATEWAY_OP_DISPATCH,
  GATEWAY_OP_HEARTBEAT,
  GATEWAY_OP_HELLO,
  GATEWAY_OP_IDENTIFY,
  GATEWAY_OP_INVALID_SESSION,
  GATEWAY_OP_RECONNECT,
  GATEWAY_READY_STATE_OPEN,
} from "./constants";
import type { CommandCooldowns } from "./cooldowns";
import { handleDiscordInteraction } from "./interactions";
import type { PublicReportDisabledAccessStatus } from "./public-price-report/access-policy";
import { disablePublicReportAccess } from "./public-price-report/access-state";
import {
  PUBLIC_PRICE_REPORT_SETTING_SELECT,
  type PublicPriceReportSetting,
} from "./public-price-report/settings";
import type { DiscordBotSchedulerStatusReader } from "./scheduler-status";
import type {
  DiscordBotClient,
  DiscordBotOptions,
  DiscordGatewayPayload,
  DiscordInteraction,
  FetchImpl,
  MinimalWebSocket,
  MinimalWebSocketConstructor,
  ShutdownController,
} from "./types";

// 執行單次 Gateway session；連線關閉後交回 daemon，由外層決定是否重連。
export async function runGatewaySession({
  client,
  options,
  shutdown,
  cooldowns,
  fetchImpl,
  WebSocketCtor,
  logMessage,
  schedulerStatus,
  unavailableGuildIds,
  onPublicReportAccessDisabled,
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  shutdown: ShutdownController;
  cooldowns: CommandCooldowns;
  fetchImpl: FetchImpl;
  WebSocketCtor: MinimalWebSocketConstructor;
  logMessage: (message: string) => void;
  schedulerStatus?: DiscordBotSchedulerStatusReader;
  unavailableGuildIds: Set<string>;
  onPublicReportAccessDisabled: (event: {
    setting: PublicPriceReportSetting;
    accessStatus: PublicReportDisabledAccessStatus;
    providerErrorCode: number | null;
  }) => void | Promise<void>;
}): Promise<void> {
  const socket = new WebSocketCtor(options.gatewayUrl);
  let sequence: number | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  shutdown.onStop(() => {
    socket.close(1000, "shutdown");
  });

  await new Promise<void>((resolve) => {
    socket.addEventListener("open", () => {
      logMessage("Discord gateway connected.");
    });

    socket.addEventListener("close", () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      resolve();
    });

    socket.addEventListener("error", () => {
      logMessage("Discord gateway socket error.");
    });

    socket.addEventListener("message", (event) => {
      const raw = readWebSocketMessageData(event);
      let payload: DiscordGatewayPayload;

      try {
        payload = JSON.parse(raw) as DiscordGatewayPayload;
      } catch {
        logMessage("Discord gateway sent an invalid JSON payload.");
        return;
      }

      if (typeof payload.s === "number") {
        sequence = payload.s;
      }

      if (payload.op === GATEWAY_OP_HELLO) {
        const heartbeatIntervalMs = readHeartbeatIntervalMs(payload.d);
        heartbeatTimer = setInterval(() => {
          sendGatewayPayload(socket, {
            op: GATEWAY_OP_HEARTBEAT,
            d: sequence,
          });
        }, heartbeatIntervalMs);
        sendIdentifyPayload(socket, options);
        return;
      }

      if (payload.op === GATEWAY_OP_RECONNECT || payload.op === GATEWAY_OP_INVALID_SESSION) {
        socket.close(4000, "reconnect requested");
        return;
      }

      if (payload.op !== GATEWAY_OP_DISPATCH) {
        return;
      }

      if (payload.t === "READY") {
        reconcileDiscordGuildAvailability(payload.d, unavailableGuildIds);
        logMessage("Discord bot ready.");
        return;
      }

      if (
        payload.t === "GUILD_CREATE" ||
        payload.t === "GUILD_DELETE" ||
        payload.t === "CHANNEL_DELETE"
      ) {
        void handleDiscordGuildLifecycleEvent({
          client,
          eventType: payload.t,
          data: payload.d,
          unavailableGuildIds,
          onPublicReportAccessDisabled,
        }).catch((error) => {
          logMessage(`Discord guild lifecycle handling failed: ${toSafeCliErrorMessage(error)}`);
        });
        return;
      }

      if (payload.t === "INTERACTION_CREATE") {
        void handleDiscordInteraction({
          client,
          interaction: payload.d as DiscordInteraction,
          options,
          cooldowns,
          fetchImpl,
          schedulerStatus,
        }).catch((error) => {
          logMessage(`Discord interaction handling failed: ${toSafeCliErrorMessage(error)}`);
        });
      }
    });
  });
}

// GUILDS 是標準 intent，用於接收 Guild/Channel lifecycle 事件以停止失效公開報告。
function sendIdentifyPayload(socket: MinimalWebSocket, options: DiscordBotOptions): void {
  sendGatewayPayload(socket, {
    op: GATEWAY_OP_IDENTIFY,
    d: {
      token: options.token,
      intents: 1 << 0,
      presence: {
        activities: options.activityText
          ? [{ name: options.activityText, type: DISCORD_ACTIVITY_TYPE_WATCHING }]
          : [],
        status: options.presenceStatus,
        since: null,
        afk: false,
      },
      properties: {
        os: process.platform,
        browser: "PartsRadarTW",
        device: "PartsRadarTW",
      },
    },
  });
}

export async function handleDiscordGuildLifecycleEvent({
  client,
  eventType,
  data,
  unavailableGuildIds,
  onPublicReportAccessDisabled,
  now = new Date(),
}: {
  client: DiscordBotClient;
  eventType: "GUILD_CREATE" | "GUILD_DELETE" | "CHANNEL_DELETE";
  data: unknown;
  unavailableGuildIds: Set<string>;
  onPublicReportAccessDisabled: (event: {
    setting: PublicPriceReportSetting;
    accessStatus: PublicReportDisabledAccessStatus;
    providerErrorCode: number | null;
  }) => void | Promise<void>;
  now?: Date;
}): Promise<void> {
  const payload = readGatewayResourcePayload(data);

  if (!payload) {
    return;
  }

  if (eventType === "GUILD_CREATE") {
    if (payload.unavailable === true) {
      unavailableGuildIds.add(payload.id);
    } else {
      unavailableGuildIds.delete(payload.id);
    }
    return;
  }

  if (eventType === "GUILD_DELETE" && payload.unavailable === true) {
    unavailableGuildIds.add(payload.id);
    return;
  }

  const where =
    eventType === "GUILD_DELETE" ? { discordGuildId: payload.id } : { channelId: payload.id };
  if (eventType === "GUILD_DELETE") {
    unavailableGuildIds.delete(payload.id);
  }
  const settings = await client.discordPublicPriceReportSetting.findMany({
    where: {
      ...where,
      accessStatus: "ACTIVE",
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
  });
  const accessStatus =
    eventType === "GUILD_DELETE" ? "DISABLED_BOT_REMOVED" : "DISABLED_CHANNEL_GONE";

  for (const setting of settings) {
    const transitionCount = await disablePublicReportAccess({
      client,
      where: { settingId: setting.id },
      accessStatus,
      providerErrorCode: null,
      now,
      includePaused: true,
    });

    if (transitionCount > 0) {
      await onPublicReportAccessDisabled({
        setting,
        accessStatus,
        providerErrorCode: null,
      });
    }
  }
}

export function reconcileDiscordGuildAvailability(
  data: unknown,
  unavailableGuildIds: Set<string>,
): void {
  if (!data || typeof data !== "object" || !("guilds" in data) || !Array.isArray(data.guilds)) {
    return;
  }

  unavailableGuildIds.clear();
  for (const guild of data.guilds) {
    const payload = readGatewayResourcePayload(guild);
    if (payload?.unavailable === true) {
      unavailableGuildIds.add(payload.id);
    }
  }
}

function readGatewayResourcePayload(data: unknown): { id: string; unavailable?: boolean } | null {
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") {
    return null;
  }

  return {
    id: data.id,
    ...("unavailable" in data && typeof data.unavailable === "boolean"
      ? { unavailable: data.unavailable }
      : {}),
  };
}

// 只在 WebSocket 開啟時送出 payload，避免 shutdown 或 reconnect 期間丟出 send 例外。
function sendGatewayPayload(socket: MinimalWebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === GATEWAY_READY_STATE_OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

// 讀取 Discord HELLO payload 的 heartbeat interval，缺值時回到保守預設。
function readHeartbeatIntervalMs(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "heartbeat_interval" in value &&
    typeof value.heartbeat_interval === "number" &&
    Number.isFinite(value.heartbeat_interval)
  ) {
    return Math.max(value.heartbeat_interval, 1000);
  }

  return 45_000;
}

// 將不同 WebSocket runtime 可能給出的 message data 格式收斂成 UTF-8 字串。
function readWebSocketMessageData(event: { data?: unknown }): string {
  if (typeof event.data === "string") {
    return event.data;
  }

  if (event.data instanceof ArrayBuffer) {
    return Buffer.from(event.data).toString("utf8");
  }

  if (Buffer.isBuffer(event.data)) {
    return event.data.toString("utf8");
  }

  return String(event.data ?? "");
}

// 取得目前 Node.js runtime 提供的 WebSocket constructor，讓測試可注入替身。
export function getWebSocketConstructor(): MinimalWebSocketConstructor {
  const WebSocketConstructor = (globalThis as { WebSocket?: MinimalWebSocketConstructor })
    .WebSocket;

  if (!WebSocketConstructor) {
    throw new Error("Global WebSocket is not available in this Node.js runtime.");
  }

  return WebSocketConstructor;
}

// 建立 SIGINT/SIGTERM shutdown controller，提供 gateway 與背景 loop 共用的停止旗標與可中止 sleep。
export function createShutdownController(
  logMessage: (message: string) => void,
): ShutdownController {
  return createInterruptibleShutdownController({
    onSignal: (signal) => {
      logMessage(`Received ${signal}; stopping Discord bot daemon.`);
    },
  });
}
