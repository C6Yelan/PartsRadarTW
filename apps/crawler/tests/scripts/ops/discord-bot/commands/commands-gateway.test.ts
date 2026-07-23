// apps/crawler/tests/scripts/ops/discord-bot/commands/commands-gateway.test.ts
// 驗證 Discord bot slash command 註冊 payload 與 Gateway identify 的低權限 intents 設定。

import { describe, expect, it, vi } from "vitest";
import { parsePublicReportInteraction } from "../../../../../src/scripts/ops/discord-bot/commands";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { runGatewaySession } from "../../../../../src/scripts/ops/discord-bot/gateway";
import { registerDiscordBotCommands } from "../../../../../src/scripts/ops/discord-bot/registration";

import { createDiscordBotClient } from "../support/client";
import { API_BASE_URL, APPLICATION_ID, createDiscordBotOptions, TOKEN } from "../support/options";

describe("registerDiscordBotCommands", () => {
  it("registers the final global command tree with guild-only administrator commands", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify([{ id: "command-1" }]), { status: 200 }),
    );

    await expect(
      registerDiscordBotCommands({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        apiBaseUrl: API_BASE_URL,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      httpStatus: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [globalUrl, globalRequestInit] = fetchMock.mock.calls[0] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    expect(String(globalUrl)).toBe(`${API_BASE_URL}/applications/${APPLICATION_ID}/commands`);
    expect(globalRequestInit.method).toBe("PUT");
    expect(globalRequestInit.headers).toMatchObject({
      authorization: `Bot ${TOKEN}`,
      "content-type": "application/json",
    });
    expect(JSON.parse(String(globalRequestInit.body))).toEqual([
      expect.objectContaining({
        name: "price-report",
        description: "查看即時價格報告並管理每日私訊價格報告。",
        contexts: [0, 1],
        dm_permission: true,
        options: [
          expect.objectContaining({ name: "now" }),
          expect.objectContaining({ name: "settings" }),
        ],
      }),
      expect.objectContaining({
        name: "watch",
        description: "設定商品目標價，價格達標時透過私訊提醒。",
        contexts: [0, 1],
        dm_permission: true,
      }),
      expect.objectContaining({
        name: "public-report",
        description: "管理伺服器公開價格報告。",
        contexts: [0],
        dm_permission: false,
        default_member_permissions: "32",
        options: [expect.objectContaining({ name: "settings" })],
      }),
      expect.objectContaining({
        name: "bot",
        description: "查看 PartsRadarTW Discord bot 使用說明。",
        contexts: [0, 1],
        dm_permission: true,
        options: [expect.objectContaining({ name: "help" })],
      }),
      expect.objectContaining({
        name: "status",
        contexts: [0],
        dm_permission: false,
        default_member_permissions: "32",
      }),
    ]);
    const registeredCommands = JSON.parse(String(globalRequestInit.body));
    const priceReportCommand = registeredCommands.find(
      (command: { name: string }) => command.name === "price-report",
    );
    expect(JSON.stringify(priceReportCommand)).not.toContain("max_items");
    expect(
      registeredCommands.find((command: { name: string }) => command.name === "watch"),
    ).not.toHaveProperty("options");
    expect(registeredCommands.map((command: { name: string }) => command.name)).toEqual([
      "price-report",
      "watch",
      "public-report",
      "bot",
      "status",
    ]);
    for (const command of registeredCommands.filter(
      (command: { name: string }) => !["public-report", "status"].includes(command.name),
    )) {
      expect(command).not.toHaveProperty("default_member_permissions");
      expect(command).not.toHaveProperty("permissions");
    }
    expect(String(globalRequestInit.body)).not.toContain('"enable"');
    expect(String(globalRequestInit.body)).not.toContain('"disable"');
    expect(String(globalRequestInit.body)).not.toContain('"manage"');
    expect(String(globalRequestInit.body)).not.toContain('"test"');
    expect(String(globalRequestInit.body).toLowerCase()).not.toContain("administrator");
  });

  it.each([
    "manage",
    "status",
    "test",
  ])("rejects the removed public-report %s parser input", (name) => {
    expect(
      parsePublicReportInteraction({
        id: "interaction",
        token: "token",
        type: 2,
        data: { name: "public-report", options: [{ type: 1, name }] },
      }),
    ).toBeNull();
  });
});

describe("runGatewaySession", () => {
  it("identifies with the standard GUILDS gateway intent", async () => {
    class TestWebSocket {
      static instance: TestWebSocket | null = null;

      readonly readyState = 1;
      readonly send = vi.fn();
      readonly close = vi.fn((_code?: number, _reason?: string) => {
        this.emit("close", {});
      });
      private readonly listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();

      constructor(readonly url: string) {
        TestWebSocket.instance = this;
      }

      addEventListener(
        type: "open" | "message" | "close" | "error",
        listener: (event: { data?: unknown }) => void,
      ): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
      }

      emit(type: "open" | "message" | "close" | "error", event: { data?: unknown }): void {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(event);
        }
      }
    }

    const run = runGatewaySession({
      client: createDiscordBotClient(),
      options: createDiscordBotOptions(),
      shutdown: {
        requested: false,
        onStop: vi.fn(),
        sleep: vi.fn(async () => undefined),
      },
      cooldowns: new CommandCooldowns(60),
      fetchImpl: vi.fn() as typeof fetch,
      WebSocketCtor: TestWebSocket,
      logMessage: vi.fn(),
      unavailableGuildIds: new Set(),
      onPublicReportAccessDisabled: vi.fn(),
    });
    const socket = TestWebSocket.instance;

    if (!socket) {
      throw new Error("Expected test websocket to be created.");
    }

    socket.emit("message", {
      data: JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }),
    });

    const identifyPayload = JSON.parse(String(socket.send.mock.calls[0]?.[0]));

    expect(identifyPayload).toMatchObject({
      op: 2,
      d: {
        token: TOKEN,
        intents: 1,
      },
    });

    socket.emit("close", {});
    await run;
  });
});
