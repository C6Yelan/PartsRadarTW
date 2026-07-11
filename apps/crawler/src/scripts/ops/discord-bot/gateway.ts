// apps/crawler/src/scripts/ops/discord-bot/gateway.ts
// 管理 Discord Gateway WebSocket session，處理 identify、heartbeat、互動事件與關閉流程。

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import {
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
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  shutdown: ShutdownController;
  cooldowns: CommandCooldowns;
  fetchImpl: FetchImpl;
  WebSocketCtor: MinimalWebSocketConstructor;
  logMessage: (message: string) => void;
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
        sendIdentifyPayload(socket, options.token);
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
        logMessage("Discord bot ready.");
        return;
      }

      if (payload.t === "INTERACTION_CREATE") {
        void handleDiscordInteraction({
          client,
          interaction: payload.d as DiscordInteraction,
          options,
          cooldowns,
          fetchImpl,
        }).catch((error) => {
          logMessage(`Discord interaction handling failed: ${toSafeCliErrorMessage(error)}`);
        });
      }
    });
  });
}

// 向 Discord Gateway identify，目前不要求 gateway intents，只接收 interaction dispatch。
function sendIdentifyPayload(socket: MinimalWebSocket, token: string): void {
  sendGatewayPayload(socket, {
    op: GATEWAY_OP_IDENTIFY,
    d: {
      token,
      intents: 0,
      properties: {
        os: process.platform,
        browser: "PartsRadarTW",
        device: "PartsRadarTW",
      },
    },
  });
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
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;
  const stopCallbacks = new Set<() => void>();

  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      logMessage(`Received ${signal}; stopping Discord bot daemon.`);
    }

    stopRequested = true;
    wakeSleeper?.();

    for (const callback of stopCallbacks) {
      callback();
    }
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  return {
    get requested() {
      return stopRequested;
    },
    onStop(callback) {
      stopCallbacks.add(callback);
    },
    sleep(ms) {
      if (stopRequested) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeoutId);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}
