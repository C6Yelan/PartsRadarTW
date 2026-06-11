// apps/crawler/src/scripts/ops/discord-bot/gateway.ts

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
        const heartbeatInterval = readHeartbeatInterval(payload.d);
        heartbeatTimer = setInterval(() => {
          sendGatewayPayload(socket, {
            op: GATEWAY_OP_HEARTBEAT,
            d: sequence,
          });
        }, heartbeatInterval);
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

function sendGatewayPayload(socket: MinimalWebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === GATEWAY_READY_STATE_OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function readHeartbeatInterval(value: unknown): number {
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

export function getWebSocketConstructor(): MinimalWebSocketConstructor {
  const WebSocketConstructor = (globalThis as { WebSocket?: MinimalWebSocketConstructor })
    .WebSocket;

  if (!WebSocketConstructor) {
    throw new Error("Global WebSocket is not available in this Node.js runtime.");
  }

  return WebSocketConstructor;
}

export function createShutdownController(logMessage: (message: string) => void): ShutdownController {
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
        const timeout = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeout);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}
