// apps/crawler/tests/scripts/ops/discord-bot.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  CommandCooldowns,
  calculateScheduledPriceReportSleepMs,
  createPublicPriceChangeReportMessages,
  type DiscordBotClient,
  type DiscordBotEmbed,
  type DiscordBotMessage,
  type DiscordBotOptions,
  type DiscordInteraction,
  enableDailyPriceReport,
  handleDiscordInteraction,
  normalizeWatchProductReference,
  parseDiscordBotOptions,
  readNextScheduledPriceReportDueAt,
  registerDiscordBotCommands,
  runGatewaySession,
  sendDiscordChannelMessages,
  sendDiscordDirectMessages,
  sendDiscordInteractionMessages,
  sendDueScheduledPriceReports,
  sendPendingPublicPriceReports,
  sendDueTargetPriceNotifications,
  sendPriceReportNow,
} from "../../../src/scripts/ops/discord-bot";

const TOKEN = "test_bot_token";
const APPLICATION_ID = "123456789012345678";
const API_BASE_URL = "https://discord.test/api/v10";
const PUBLIC_BASE_URL = "https://partsradar.test/";
const WATCH_PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const WATCH_ROW_ID = "22222222-2222-4222-8222-222222222222";
const TEST_SOURCE_CATEGORIES = [
  { igrp: 4, displayName: "CPU" },
  { igrp: 5, displayName: "主機板" },
  { igrp: 6, displayName: "記憶體" },
  { igrp: 7, displayName: "SSD / HDD" },
  { igrp: 12, displayName: "顯示卡" },
] as const;

describe("Discord bot options", () => {
  it("parses required bot settings and safe defaults", () => {
    expect(
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: APPLICATION_ID,
        PARTSRADAR_PUBLIC_BASE_URL: PUBLIC_BASE_URL,
      }),
    ).toMatchObject({
      token: TOKEN,
      applicationId: APPLICATION_ID,
      publicBaseUrl: "https://partsradar.test/",
      apiBaseUrl: "https://discord.com/api/v10",
      registerCommands: false,
      registerCommandsOnStart: true,
      priceReportMaxItems: 50,
      commandCooldownSeconds: 60,
      priceReportScheduleIntervalSeconds: 300,
    });
  });

  it("rejects missing token or invalid ids", () => {
    expect(() => parseDiscordBotOptions([], {})).toThrow("DISCORD_BOT_TOKEN is required");
    expect(() =>
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: "not-an-id",
      }),
    ).toThrow("DISCORD_APPLICATION_ID must be a Discord snowflake id");
  });
});

describe("registerDiscordBotCommands", () => {
  it("registers the global price-report, watch, and public-report commands", async () => {
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
        contexts: [0, 1],
        dm_permission: true,
        options: [
          expect.objectContaining({ name: "now" }),
          expect.objectContaining({ name: "settings" }),
        ],
      }),
      expect.objectContaining({
        name: "watch",
        description: "設定與管理商品目標價格，集中查看目前價格及追蹤狀態。",
        contexts: [0, 1],
        dm_permission: true,
      }),
      expect.objectContaining({
        name: "public-report",
        description: "管理公開價格報告發送頻道。",
        contexts: [0],
        dm_permission: false,
      }),
    ]);
    const registeredCommands = JSON.parse(String(globalRequestInit.body));
    expect(
      registeredCommands.find((command: { name: string }) => command.name === "watch"),
    ).not.toHaveProperty("options");
    expect(registeredCommands.map((command: { name: string }) => command.name)).toEqual([
      "price-report",
      "watch",
      "public-report",
    ]);
    for (const command of registeredCommands) {
      expect(command).not.toHaveProperty("default_member_permissions");
      expect(command).not.toHaveProperty("permissions");
    }
    expect(String(globalRequestInit.body)).not.toContain('"enable"');
    expect(String(globalRequestInit.body)).not.toContain('"disable"');
    expect(String(globalRequestInit.body).toLowerCase()).not.toContain("administrator");
  });
});

describe("runGatewaySession", () => {
  it("identifies with no gateway intents", async () => {
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
      client: createDiscordBotClient([]),
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
        intents: 0,
      },
    });

    socket.emit("close", {});
    await run;
  });
});

describe("normalizeWatchProductReference", () => {
  it("accepts product ids and PartsRadarTW product URLs", () => {
    expect(normalizeWatchProductReference(WATCH_PRODUCT_ID.toUpperCase())).toBe(WATCH_PRODUCT_ID);
    expect(
      normalizeWatchProductReference(`https://partsradar.test/products/${WATCH_PRODUCT_ID}`),
    ).toBe(WATCH_PRODUCT_ID);
    expect(normalizeWatchProductReference(`/products/${WATCH_PRODUCT_ID}`)).toBe(WATCH_PRODUCT_ID);
    expect(
      normalizeWatchProductReference("https://partsradar.test/products/not-a-product"),
    ).toBeNull();
    expect(normalizeWatchProductReference("/products/%E0%A4%A")).toBeNull();
  });
});

describe("sendDiscordDirectMessages", () => {
  it("creates a DM channel and posts all report messages with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, requestInit) => {
      if (String(requestInit?.body).includes("recipient_id")) {
        return new Response(JSON.stringify({ id: "dm-channel" }), { status: 200 });
      }

      return new Response(JSON.stringify({ id: "message" }), { status: 200 });
    });

    await expect(
      sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        messages: [{ content: "Report 1" }, { content: "Report 2 @everyone" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      messageCount: 2,
      httpStatuses: [200, 200],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, secondRequest] = fetchMock.mock.calls[1] as [Parameters<typeof fetch>[0], RequestInit];
    expect(JSON.parse(String(secondRequest.body))).toMatchObject({
      content: "Report 1",
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("uses Discord JSON retry_after when rate limited without a Retry-After header", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ retry_after: 1.25, global: true }), {
          status: 429,
        }),
    );

    await expect(
      sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        messages: [{ content: "Report" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "rate_limited",
      messageCount: 1,
      sentMessageCount: 0,
      retryAfterMs: 1250,
      global: true,
    });
  });
});

describe("sendDiscordChannelMessages", () => {
  it("posts messages to a channel with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordChannelMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        channelId: "999988887777666655",
        messages: [{ content: "Public report @everyone" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      messageCount: 1,
      httpStatuses: [200],
    });

    const [url, request] = fetchMock.mock.calls[0] as [Parameters<typeof fetch>[0], RequestInit];
    expect(String(url)).toBe(`${API_BASE_URL}/channels/999988887777666655/messages`);
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({
      content: "Public report @everyone",
      allowed_mentions: {
        parse: [],
      },
    });
  });
});

describe("sendDiscordInteractionMessages", () => {
  it("edits the original command response and posts follow-up chunks", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordInteractionMessages({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        apiBaseUrl: API_BASE_URL,
        interaction: {
          id: "interaction-1",
          token: "interaction-token",
          type: 2,
        },
        messages: [{ content: "Report 1" }, { content: "Report 2 @everyone" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      messageCount: 2,
      httpStatuses: [200, 200],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstRequest] = fetchMock.mock.calls[0] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    const [secondUrl, secondRequest] = fetchMock.mock.calls[1] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    expect(String(firstUrl)).toBe(
      `${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token/messages/@original`,
    );
    expect(firstRequest.method).toBe("PATCH");
    expect(JSON.parse(String(firstRequest.body))).toEqual({
      content: "Report 1",
      allowed_mentions: {
        parse: [],
      },
    });
    expect(String(secondUrl)).toBe(`${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token`);
    expect(secondRequest.method).toBe("POST");
    expect(JSON.parse(String(secondRequest.body))).toEqual({
      content: "Report 2 @everyone",
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("sends embed payloads with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordInteractionMessages({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        apiBaseUrl: API_BASE_URL,
        interaction: {
          id: "interaction-1",
          token: "interaction-token",
          type: 2,
        },
        messages: [
          {
            embeds: [
              {
                title: "PartsRadarTW 價格報告",
                description: "過去 24 小時：價格變動 1，新增商品 0",
              },
            ],
          },
        ],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      messageCount: 1,
    });

    const [, request] = fetchMock.mock.calls[0] as [Parameters<typeof fetch>[0], RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      embeds: [
        {
          title: "PartsRadarTW 價格報告",
          description: "過去 24 小時：價格變動 1，新增商品 0",
        },
      ],
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("can keep all interaction report chunks ephemeral", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordInteractionMessages({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        apiBaseUrl: API_BASE_URL,
        interaction: {
          id: "interaction-1",
          token: "interaction-token",
          type: 2,
        },
        messages: [{ content: "Preview 1" }, { content: "Preview 2" }],
        fetchImpl: fetchMock as typeof fetch,
        ephemeral: true,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      messageCount: 2,
    });

    const payloads = fetchMock.mock.calls.map(([, requestInit]) =>
      JSON.parse(String((requestInit as RequestInit | undefined)?.body)),
    );

    expect(payloads).toEqual([
      expect.objectContaining({ content: "Preview 1", flags: 64 }),
      expect.objectContaining({ content: "Preview 2", flags: 64 }),
    ]);
  });
});

describe("handleDiscordInteraction", () => {
  it("opens an empty target price watch manager from the watch command", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchOpenInteraction(),
    });

    expect(client.discordTargetPriceWatch.upsert).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const deferredBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );

    expect(deferredBody).toEqual({ type: 5, data: { flags: 64 } });
    expect(requestBody).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "商品目標價追蹤",
          description: expect.stringContaining("尚未追蹤商品"),
        }),
      ],
      components: [
        {
          type: 1,
          components: [
            expect.objectContaining({ custom_id: "watch:add", label: "新增追蹤" }),
            expect.objectContaining({ custom_id: "watch:edit:none:0:0", disabled: true }),
            expect.objectContaining({ custom_id: "watch:remove:none:0", disabled: true }),
            expect.objectContaining({ custom_id: "watch:refresh:0" }),
          ],
        },
      ],
    });
    expect(client.discordTargetPriceWatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 26,
      }),
    );
  });

  it("opens the create form from the watch manager", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchButtonInteraction("watch:add"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: "watch:create-modal",
        title: "新增商品目標價",
        components: [
          expect.objectContaining({
            label: "PartsRadarTW 商品",
            description: expect.stringContaining("商品頁完整網址"),
            component: expect.objectContaining({ custom_id: "watch:product" }),
          }),
          expect.objectContaining({
            label: "理想入手價格（新台幣）",
            description: expect.stringContaining("不要加 NT$"),
            component: expect.objectContaining({ custom_id: "watch:target-price" }),
          }),
        ],
      },
    });
    expect(requestBody.data.components[0].component).not.toHaveProperty("value");
    expect(requestBody.data.components[1].component).not.toHaveProperty("value");
  });

  it("surfaces Discord API validation errors when the watch manager response is rejected", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            code: 50_035,
            message: "Invalid Form Body",
            errors: {
              data: {
                components: {
                  0: {
                    component: {
                      value: {
                        _errors: [{ code: "BASE_TYPE_BAD_LENGTH", message: "Must not be empty." }],
                      },
                    },
                  },
                },
              },
            },
          }),
          { status: 400 },
        ),
    );

    await expect(
      handleDiscordInteraction({
        client,
        options: createDiscordBotOptions(),
        cooldowns: new CommandCooldowns(60),
        fetchImpl: fetchMock as typeof fetch,
        interaction: createWatchOpenInteraction(),
      }),
    ).rejects.toThrow(/Discord deferred interaction response failed:.*Invalid Form Body/);
  });

  it("creates a target price watch from the watch modal", async () => {
    const client = createDiscordBotClient([
      snapshot({
        id: "snapshot-watch-1",
        productId: WATCH_PRODUCT_ID,
        productName: "RTX 5070 測試卡",
        crawlRunId: "new-run",
        price: 18_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
    ]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchModalSubmitInteraction({
        productInput: `https://partsradar.test/products/${WATCH_PRODUCT_ID}`,
        targetPrice: "17500",
      }),
    });

    expect(client.discordTargetPriceWatch.upsert).toHaveBeenCalledWith({
      where: {
        discordUserId_productId: {
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
        },
      },
      create: {
        discordUserId: "111122223333444455",
        productId: WATCH_PRODUCT_ID,
        targetPrice: 17_500,
        currency: "TWD",
        enabled: true,
      },
      update: {
        targetPrice: 17_500,
        currency: "TWD",
        enabled: true,
        lastNotifiedAt: null,
        notificationClaimedAt: null,
      },
      select: expect.objectContaining({
        id: true,
        targetPrice: true,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      client.product.findFirst.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    const deferredResponseBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );

    expect(deferredResponseBody).toEqual({
      type: 5,
      data: { flags: 64 },
    });
    expect(requestBody).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "商品目標價追蹤",
          description: expect.stringContaining("RTX 5070 測試卡"),
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "目前價格", value: "NT$18,990" }),
            expect.objectContaining({ name: "目標價格", value: "NT$17,500" }),
          ]),
        }),
      ],
    });
    expect(requestBody.embeds[0].description).toContain("已儲存商品目標價");
  });

  it("selects a watch and enables its edit and remove actions", async () => {
    const client = createWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchSelectInteraction(`watch:${WATCH_ROW_ID}`, 0),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const deferredBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );

    expect(deferredBody).toEqual({ type: 6 });
    expect(requestBody).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "商品目標價追蹤",
          description: expect.stringContaining("RTX 5070 測試卡"),
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "價格資料時間",
              value: "06/07 11:00 GMT+8",
            }),
          ]),
        }),
      ],
      components: expect.arrayContaining([
        expect.objectContaining({
          components: [
            expect.objectContaining({
              custom_id: "watch:select:0",
              options: [expect.objectContaining({ value: `watch:${WATCH_ROW_ID}`, default: true })],
            }),
          ],
        }),
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              custom_id: `watch:edit:${WATCH_ROW_ID}:17500:0`,
              disabled: false,
            }),
            expect.objectContaining({
              custom_id: `watch:remove:${WATCH_ROW_ID}:0`,
              disabled: false,
            }),
          ]),
        }),
      ]),
    });
  });

  it("shows a readable latest target-price notification failure for a selected watch", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "snapshot-watch-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 18_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [],
      [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
        }),
      ],
      [...TEST_SOURCE_CATEGORIES],
      [
        notificationDelivery({
          id: "delivery-watch-failed",
          discordUserId: "111122223333444455",
          kind: "TARGET_PRICE",
          status: "FAILED",
          targetPriceWatchId: WATCH_ROW_ID,
          errorMessage: "Discord API returned HTTP 403. code=50013 message=Missing Permissions",
          createdAt: new Date("2026-06-07T01:00:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchSelectInteraction(`watch:${WATCH_ROW_ID}`, 0),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );
    const latestNotification = readEmbedFieldValue(requestBody.embeds[0], "最近一次通知");

    expect(latestNotification).toContain("我目前缺少 Discord 要求的權限");
    expect(latestNotification).not.toContain("50013");
    expect(latestNotification).not.toContain("Missing Permissions");
    expect(client.discordNotificationDelivery.findFirst).toHaveBeenCalledWith({
      where: {
        discordUserId: "111122223333444455",
        kind: "TARGET_PRICE",
        targetPriceWatchId: WATCH_ROW_ID,
      },
      select: expect.objectContaining({
        status: true,
        errorMessage: true,
      }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });

  it("opens a prefilled edit form for the selected watch", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchButtonInteraction(`watch:edit:${WATCH_ROW_ID}:17500:0`),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: `watch:edit-modal:${WATCH_ROW_ID}:0`,
        title: "修改商品目標價",
        components: [
          expect.objectContaining({
            label: "新的目標價格（新台幣）",
            description: expect.stringContaining("只會修改目前選取的商品"),
            component: expect.objectContaining({
              custom_id: "watch:target-price",
              value: "17500",
            }),
          }),
        ],
      },
    });
  });

  it("rejects invalid watch modal values with field guidance", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchModalSubmitInteraction({
        productInput: "",
        targetPrice: "NT$17,500",
      }),
    });

    expect(client.discordTargetPriceWatch.upsert).not.toHaveBeenCalled();
    const responseBody = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body);
    expect(responseBody).toContain("PartsRadarTW 商品頁完整網址");
    expect(responseBody).toContain("網址 `/products/` 後面的商品 ID");
    expect(responseBody).toContain("目標價格需為");
    expect(responseBody).toContain("不要輸入 NT$");
  });

  it("shows active target price watches in the watch manager", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "snapshot-watch-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 18_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [],
      [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
        }),
        targetPriceWatch({
          id: "33333333-3333-4333-8333-333333333333",
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 10_000,
          enabled: false,
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchOpenInteraction(),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "商品目標價追蹤",
          description: expect.stringContaining("追蹤商品目標價"),
        }),
      ],
      components: expect.arrayContaining([
        expect.objectContaining({
          components: [
            expect.objectContaining({
              custom_id: "watch:select:0",
              options: [
                expect.objectContaining({
                  label: "RTX 5070 測試卡",
                  value: `watch:${WATCH_ROW_ID}`,
                  description: expect.stringContaining("目標 NT$17,500"),
                }),
              ],
            }),
          ],
        }),
      ]),
    });
    expect(requestBody.embeds[0].description).not.toContain("此頁面只有你看得到");
    expect(requestBody.embeds[0].description).toContain("**使用方式**");
    expect(requestBody.embeds[0].description).toContain("從選單選商品");
    expect(JSON.stringify(requestBody.embeds)).not.toContain(WATCH_ROW_ID);
  });

  it("paginates watch manager options at the Discord select limit", async () => {
    const snapshots = Array.from({ length: 26 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");

      return snapshot({
        id: `snapshot-watch-${index + 1}`,
        productId: `10000000-0000-4000-8000-${suffix}`,
        productName: `測試商品 ${index + 1}`,
        crawlRunId: "new-run",
        price: 20_000 + index,
        capturedAt: "2026-06-07T03:00:00.000Z",
      });
    });
    const watches = snapshots.map((item, index) =>
      targetPriceWatch({
        id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        discordUserId: "111122223333444455",
        productId: item.productId,
        targetPrice: 17_500 + index,
      }),
    );
    const client = createDiscordBotClient(snapshots, [], watches);
    const firstPageFetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: firstPageFetch as typeof fetch,
      interaction: createWatchOpenInteraction(),
    });

    const firstPage = JSON.parse(String(firstPageFetch.mock.calls[1]?.[1]?.body));
    expect(firstPage.components[0].components[0]).toMatchObject({
      custom_id: "watch:select:0",
      options: expect.any(Array),
    });
    expect(firstPage.components[0].components[0].options).toHaveLength(25);
    expect(firstPage.components[2].components).toContainEqual(
      expect.objectContaining({ custom_id: "watch:page:1", disabled: false }),
    );

    const secondPageFetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );
    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: secondPageFetch as typeof fetch,
      interaction: createWatchButtonInteraction("watch:page:1"),
    });

    const secondPage = JSON.parse(String(secondPageFetch.mock.calls[1]?.[1]?.body));
    expect(secondPage.components[0].components[0]).toMatchObject({
      custom_id: "watch:select:1",
      options: expect.any(Array),
    });
    expect(secondPage.components[0].components[0].options).toHaveLength(1);
    expect(secondPage.components[2].components).toContainEqual(
      expect.objectContaining({ custom_id: "watch:page:0", disabled: false }),
    );
  });

  it("updates a selected watch from the edit form", async () => {
    const client = createWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchEditModalSubmitInteraction({
        watchId: WATCH_ROW_ID,
        targetPrice: "16500",
        page: 0,
      }),
    });

    expect(client.discordTargetPriceWatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: WATCH_ROW_ID,
        discordUserId: "111122223333444455",
        enabled: true,
      },
      data: {
        targetPrice: 16_500,
        lastNotifiedAt: null,
        notificationClaimedAt: null,
      },
    });
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );
    expect(requestBody.embeds[0].description).toContain("已更新目標價格");
    expect(JSON.stringify(requestBody.embeds)).toContain("NT$16,500");
  });

  it("shows a confirmation before removing a selected watch", async () => {
    const client = createWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchButtonInteraction(`watch:remove:${WATCH_ROW_ID}:0`),
    });

    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ type: 6 });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(requestBody).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "確認移除目標價追蹤",
          description: expect.stringContaining("RTX 5070 測試卡"),
        }),
      ],
      components: [
        {
          type: 1,
          components: [
            expect.objectContaining({
              custom_id: `watch:remove-confirm:${WATCH_ROW_ID}:0`,
              label: "確認移除",
            }),
            expect.objectContaining({
              custom_id: `watch:remove-cancel:${WATCH_ROW_ID}:0`,
              label: "返回設定",
            }),
          ],
        },
      ],
    });
    expect(requestBody.embeds[0].description).toContain("移除後，這項商品將不再出現在你的追蹤清單");
    expect(requestBody.embeds[0].footer.text).toContain("商品資料不會被刪除");
    expect(JSON.stringify(requestBody.embeds)).not.toContain(WATCH_ROW_ID);
  });

  it("returns to the manager when removal is cancelled", async () => {
    const client = createWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchButtonInteraction(`watch:remove-cancel:${WATCH_ROW_ID}:0`),
    });

    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(requestBody.components[0].components[0].options[0]).toMatchObject({
      value: `watch:${WATCH_ROW_ID}`,
      default: true,
    });
    expect(requestBody.components[1].components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ custom_id: `watch:edit:${WATCH_ROW_ID}:17500:0` }),
        expect.objectContaining({ custom_id: `watch:remove:${WATCH_ROW_ID}:0` }),
      ]),
    );
  });

  it("removes a watch after confirmation and refreshes the manager", async () => {
    const client = createWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchButtonInteraction(`watch:remove-confirm:${WATCH_ROW_ID}:0`),
    });

    expect(client.discordTargetPriceWatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: WATCH_ROW_ID,
        discordUserId: "111122223333444455",
        enabled: true,
      },
      data: {
        enabled: false,
      },
    });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(requestBody.embeds[0]).toMatchObject({
      title: "商品目標價追蹤",
      description: expect.stringContaining("已移除目標價追蹤"),
    });
    expect(requestBody.embeds[0].description).toContain("尚未追蹤商品");
  });

  it("refreshes the current watch manager page", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchButtonInteraction("watch:refresh:0"),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ type: 6 });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "商品目標價追蹤",
          description: expect.stringContaining("尚未追蹤商品"),
        }),
      ],
    });
  });

  it("rejects an invalid target price from the edit form", async () => {
    const client = createWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchEditModalSubmitInteraction({
        watchId: WATCH_ROW_ID,
        targetPrice: "NT$17,500",
        page: 0,
      }),
    });

    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("目標價格需為");
  });

  it("sends the settings panel from the settings command", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createInteraction("settings"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          expect.objectContaining({
            title: "價格報告設定",
            description: "尚未開啟每日價格提醒。",
            fields: expect.arrayContaining([
              expect.objectContaining({ name: "統計區間", value: "過去 24 小時" }),
              expect.objectContaining({ name: "分類", value: "全部分類" }),
              expect.objectContaining({ name: "內容", value: "降價、漲價、新增商品" }),
              expect.objectContaining({ name: "商品關鍵字", value: "不限" }),
              expect.objectContaining({ name: "每次最多", value: "50 筆" }),
              expect.objectContaining({ name: "每日時間", value: "09:00" }),
              expect.objectContaining({ name: "下一次", value: "啟用後排程" }),
              expect.objectContaining({
                name: "最近一次每日報告",
                value: "尚無每日報告紀錄。",
              }),
            ]),
          }),
        ],
        components: [
          {
            type: 1,
            components: [
              expect.objectContaining({
                type: 3,
                custom_id: "price-report:settings:window",
                placeholder: "統計區間",
              }),
            ],
          },
          {
            type: 1,
            components: [
              expect.objectContaining({
                type: 3,
                custom_id: "price-report:settings:categories",
                placeholder: "分類篩選",
                options: expect.arrayContaining([
                  expect.objectContaining({
                    label: "顯示卡",
                    value: "12",
                    default: true,
                  }),
                ]),
              }),
            ],
          },
          {
            type: 1,
            components: [
              expect.objectContaining({
                type: 3,
                custom_id: "price-report:settings:events",
                placeholder: "報告內容",
              }),
            ],
          },
          {
            type: 1,
            components: expect.arrayContaining([
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:preview",
                label: "傳送預覽 DM",
              }),
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:keyword",
                label: "調整關鍵字",
              }),
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:time-limit",
                label: "調整時間與上限",
              }),
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:enable",
                label: "開啟每日報告",
              }),
            ]),
          },
        ],
      },
    });
    expect(requestBody.data).not.toHaveProperty("content");
    expect(JSON.stringify(requestBody.data.components)).not.toContain(
      "price-report:settings:all-categories",
    );
  });

  it("shows daily report filter names in the settings summary", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          categoryIgrps: [12, 7],
          productKeyword: "RTX 5090",
          includePriceRises: false,
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createInteraction("settings"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    const embed = readResponseEmbed(requestBody);

    expect(readEmbedFieldValue(embed, "分類")).toBe("SSD / HDD、顯示卡");
    expect(readEmbedFieldValue(embed, "商品關鍵字")).toBe("RTX 5090");
    expect(readEmbedFieldValue(embed, "內容")).toBe("降價、新增商品");
  });

  it("shows the latest scheduled daily report delivery status in settings", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
        }),
      ],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [
        notificationDelivery({
          id: "delivery-old",
          discordUserId: "111122223333444455",
          kind: "SCHEDULED_PRICE_REPORT",
          status: "FAILED",
          errorMessage: "old failure",
          createdAt: new Date("2026-06-06T01:00:00.000Z"),
        }),
        notificationDelivery({
          id: "delivery-new",
          discordUserId: "111122223333444455",
          kind: "SCHEDULED_PRICE_REPORT",
          status: "SENT",
          itemCount: 7,
          messageCount: 2,
          deliveredAt: new Date("2026-06-07T01:00:00.000Z"),
          createdAt: new Date("2026-06-07T01:00:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createInteraction("settings"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    const deliveryStatus = readEmbedFieldValue(readResponseEmbed(requestBody), "最近一次每日報告");

    expect(deliveryStatus).toBe("成功：06/07 09:00 GMT+8，列出 7 筆，送出 2 則訊息。");
    expect(client.discordNotificationDelivery.findFirst).toHaveBeenCalledWith({
      where: {
        discordUserId: "111122223333444455",
        kind: "SCHEDULED_PRICE_REPORT",
      },
      select: expect.objectContaining({
        status: true,
        itemCount: true,
        messageCount: true,
      }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });

  it("shows a readable DM permission hint for failed daily reports", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
        }),
      ],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [
        notificationDelivery({
          id: "delivery-dm-failed",
          discordUserId: "111122223333444455",
          kind: "SCHEDULED_PRICE_REPORT",
          status: "FAILED",
          errorMessage:
            "Discord API returned HTTP 403. code=50007 message=Cannot send messages to this user",
          createdAt: new Date("2026-06-07T01:00:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createInteraction("settings"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    const deliveryStatus = readEmbedFieldValue(readResponseEmbed(requestBody), "最近一次每日報告");

    expect(deliveryStatus).toContain("我目前無法傳送私訊給你");
    expect(deliveryStatus).not.toContain("50007");
    expect(deliveryStatus).not.toContain("Cannot send messages");
  });

  it("does not consume the price report cooldown for settings commands", async () => {
    const client = createDiscordBotClient([]);
    const cooldowns = new CommandCooldowns(60);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );
    const options = createDiscordBotOptions();

    await handleDiscordInteraction({
      client,
      options,
      cooldowns,
      fetchImpl: fetchMock as typeof fetch,
      interaction: createInteraction("settings"),
    });
    await handleDiscordInteraction({
      client,
      options,
      cooldowns,
      fetchImpl: fetchMock as typeof fetch,
      interaction: createInteraction("now"),
    });

    const requestBodies = fetchMock.mock.calls.map(([, requestInit]) =>
      String((requestInit as RequestInit | undefined)?.body ?? ""),
    );
    const urls = fetchMock.mock.calls.map(([url]) => String(url));

    expect(requestBodies.join("\n")).not.toContain("請等待");
    expect(urls).toContain(
      `${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token/messages/@original`,
    );
  });

  it("sends the configured price report preview as a DM from the settings panel", async () => {
    const now = new Date();
    const oldCapturedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const newCapturedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "preview-old",
          productId: "preview-product",
          productName: "華碩 RTX 5070 測試卡",
          crawlRunId: "old-run",
          price: 20_000,
          capturedAt: oldCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "preview-new",
          productId: "preview-product",
          productName: "華碩 RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 18_990,
          capturedAt: newCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
      ],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          categoryIgrps: [12],
          productKeyword: "RTX 5070",
          includeNewProducts: false,
          enabled: false,
          nextSendAt: null,
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createComponentInteraction("price-report:settings:preview"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: 5,
      data: { flags: 64 },
    });

    const previewBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    const settingsBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API_BASE_URL}/users/@me/channels`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      recipient_id: "111122223333444455",
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`${API_BASE_URL}/channels/message/messages`);
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token/messages/@original`,
    );
    expect(previewBody).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "PartsRadarTW 價格報告 - 價格變動",
          description: expect.stringContaining("RTX 5070"),
        }),
      ],
      allowed_mentions: {
        parse: [],
      },
    });
    expect(JSON.stringify(settingsBody)).toContain("已傳送預覽 DM");
    expect(JSON.stringify(previewBody)).not.toContain("新增商品");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordUserId: "111122223333444455",
        kind: "PRICE_REPORT_NOW",
        status: "SENT",
      }),
    });
  });

  it("shows a readable DM failure when the price report preview cannot be delivered", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "preview-new",
          productId: "preview-product",
          productName: "華碩 RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 18_990,
          capturedAt: new Date().toISOString(),
        }),
      ],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          enabled: false,
          nextSendAt: null,
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/users/@me/channels")) {
        return new Response(
          JSON.stringify({
            code: 50007,
            message: "Cannot send messages to this user",
          }),
          { status: 403 },
        );
      }

      return new Response(JSON.stringify({ id: "message" }), { status: 200 });
    });

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createComponentInteraction("price-report:settings:preview"),
    });

    const settingsBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));

    expect(JSON.stringify(settingsBody)).toContain("我目前無法傳送私訊給你");
    expect(JSON.stringify(settingsBody)).not.toContain("50007");
    expect(JSON.stringify(settingsBody)).not.toContain("Cannot send messages");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordUserId: "111122223333444455",
        kind: "PRICE_REPORT_NOW",
        status: "FAILED",
      }),
    });
  });

  it("opens a time and limit modal from the settings panel", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          window: "HOURS_12",
          maxItems: 12,
          categoryIgrps: [12],
          includeNewProducts: false,
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createComponentInteraction("price-report:settings:time-limit"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: "price-report:settings:time-limit-modal",
        title: "每日報告時間與上限",
      },
    });
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"12"');
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"21:30"');
    expect(JSON.stringify(requestBody.data.components)).not.toContain(
      "price-report:settings:categories",
    );
  });

  it("opens a keyword modal from the settings panel", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          productKeyword: "RTX 5090",
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createComponentInteraction("price-report:settings:keyword"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: "price-report:settings:keyword-modal",
        title: "價格報告關鍵字",
      },
    });
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"RTX 5090"');
    expect(requestBody.data.components[0]).toEqual({
      type: 10,
      content: [
        "**格式說明**",
        "留空：不限制商品名稱。",
        "空白：同一組關鍵字都要符合，例如 `RTX 5090`。",
        "逗號：多組擇一符合，例如 `RTX 5090, DDR5`。",
      ].join("\n"),
    });
    expect(requestBody.data.components[1]).toMatchObject({
      type: 18,
      label: "商品名稱關鍵字",
      component: {
        type: 4,
        custom_id: "price-report:settings:keyword-input",
        value: "RTX 5090",
      },
    });
    expect(requestBody.data.components[1]).not.toHaveProperty("description");
  });

  it("updates daily report time and item limit from the settings modal", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          window: "HOURS_12",
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includeNewProducts: false,
          nextSendAt: new Date("2026-06-07T01:00:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createSettingsModalSubmitInteraction({
        maxItems: "8",
        time: "21:30",
      }),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          window: "HOURS_12",
          maxItems: 8,
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: false,
          enabled: true,
        }),
        update: expect.objectContaining({
          window: "HOURS_12",
          maxItems: 8,
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: false,
          enabled: true,
        }),
      }),
    );
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)).toContain(
      "已更新每日價格提醒",
    );
  });

  it("updates the daily report product keyword from the settings modal", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          window: "HOURS_12",
          maxItems: 12,
          categoryIgrps: [12],
          includeNewProducts: false,
          nextSendAt: new Date("2026-06-07T01:00:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createKeywordModalSubmitInteraction({ keyword: " RTX   5090，  DDR5 " }),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          window: "HOURS_12",
          maxItems: 12,
          categoryIgrps: [12],
          productKeyword: "RTX 5090, DDR5",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: false,
          enabled: true,
        }),
        update: expect.objectContaining({
          window: "HOURS_12",
          maxItems: 12,
          categoryIgrps: [12],
          productKeyword: "RTX 5090, DDR5",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: false,
          enabled: true,
        }),
      }),
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(readEmbedFieldValue(readResponseEmbed(requestBody), "商品關鍵字")).toBe(
      "RTX 5090, DDR5",
    );
  });

  it("clears the daily report product keyword from the settings modal", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          productKeyword: "RTX 5090",
          nextSendAt: new Date("2026-06-07T01:00:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createKeywordModalSubmitInteraction({ keyword: "" }),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          productKeyword: null,
        }),
        update: expect.objectContaining({
          productKeyword: null,
        }),
      }),
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(readEmbedFieldValue(readResponseEmbed(requestBody), "商品關鍵字")).toBe("不限");
  });

  it("resets category choices to all categories from the settings panel", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          categoryIgrps: [7, 12],
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createComponentInteraction("price-report:settings:all-categories"),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          categoryIgrps: [],
        }),
        update: expect.objectContaining({
          categoryIgrps: [],
        }),
      }),
    );
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({ type: 6 });
    const updatedBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );

    expect(readEmbedFieldValue(readResponseEmbed(updatedBody), "分類")).toBe("全部分類");
    expect(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body)).not.toContain(
      "price-report:settings:all-categories",
    );
  });

  it("updates category choices from the settings panel", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createSelectComponentInteraction("price-report:settings:categories", [
        "7",
        "12",
      ]),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          categoryIgrps: [7, 12],
        }),
        update: expect.objectContaining({
          categoryIgrps: [7, 12],
        }),
      }),
    );
    const updatedBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );
    const categorySelect = updatedBody.components[1].components[0];

    expect(categorySelect.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "SSD / HDD", default: true }),
        expect.objectContaining({ label: "顯示卡", default: true }),
        expect.objectContaining({ label: "CPU", default: false }),
      ]),
    );
    expect(categorySelect.options).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "全部分類" })]),
    );
    expect(updatedBody.components[2].components[0]).toEqual(
      expect.objectContaining({
        custom_id: "price-report:settings:all-categories",
        label: "改為全部分類",
      }),
    );
  });

  it("rejects invalid daily report modal values", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createSettingsModalSubmitInteraction({
        maxItems: "0",
        time: "25:99",
      }),
    });

    const requestBody = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body);

    expect(requestBody).toContain("最多商品數需為 1-50 的整數");
    expect(requestBody).toContain("每日發送時間格式需為台北時間 HH:mm");
    expect(client.discordPriceReportSetting.upsert).not.toHaveBeenCalled();
  });

  it("disables daily report settings from the settings button", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
        }),
      ],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createComponentInteraction("price-report:settings:disable"),
    });

    expect(client.discordPriceReportSetting.updateMany).toHaveBeenCalledWith({
      where: {
        discordUserId: "111122223333444455",
        enabled: true,
      },
      data: {
        enabled: false,
        nextSendAt: null,
      },
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({ type: 6 });
    expect(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body)).toContain(
      "已關閉每日價格提醒",
    );
  });
});

describe("sendDueTargetPriceNotifications", () => {
  it("sends a reached target price once and records the delivery", async () => {
    const now = new Date("2026-06-07T05:00:00.000Z");
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "snapshot-target-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 15_000,
          capturedAt: "2026-06-07T04:55:00.000Z",
        }),
      ],
      [],
      [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now,
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 1,
      dueCount: 1,
      processedCount: 1,
      sentCount: 1,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendDirectMessages).toHaveBeenCalledWith("111122223333444455", [
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            title: "商品已達到目標價格",
            description: expect.stringContaining(
              `https://partsradar.test/products/${WATCH_PRODUCT_ID}`,
            ),
            fields: [
              { name: "目前價格", value: "NT$15,000", inline: true },
              { name: "目標價格", value: "NT$17,500", inline: true },
            ],
          }),
        ],
      }),
    ]);
    expect(sendDirectMessages.mock.calls[0]?.[1][0]?.embeds?.[0]).not.toHaveProperty("timestamp");
    expect(JSON.stringify(sendDirectMessages.mock.calls[0]?.[1])).not.toContain("只會通知一次");
    expect(JSON.stringify(sendDirectMessages.mock.calls[0]?.[1])).not.toContain("達標差額");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: {
        discordUserId: "111122223333444455",
        kind: "TARGET_PRICE",
        status: "SENT",
        productId: WATCH_PRODUCT_ID,
        targetPriceWatchId: WATCH_ROW_ID,
        dedupeKey: `target-price:${WATCH_ROW_ID}:2026-06-07T00:00:00.000Z`,
        itemCount: 1,
        messageCount: 1,
        deliveredAt: now,
        errorMessage: null,
      },
    });

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:05:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 0,
      dueCount: 0,
      processedCount: 0,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });
    expect(sendDirectMessages).toHaveBeenCalledTimes(1);
  });

  it("combines same-user target price notifications into one DM digest", async () => {
    const now = new Date("2026-06-07T05:00:00.000Z");
    const secondProductId = "33333333-3333-4333-8333-333333333333";
    const secondWatchId = "44444444-4444-4444-8444-444444444444";
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "snapshot-target-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 15_000,
          capturedAt: "2026-06-07T04:55:00.000Z",
        }),
        snapshot({
          id: "snapshot-target-2",
          productId: secondProductId,
          productName: "DDR5 64GB 測試記憶體",
          crawlRunId: "new-run",
          price: 4_500,
          capturedAt: "2026-06-07T04:56:00.000Z",
        }),
      ],
      [],
      [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
        }),
        targetPriceWatch({
          id: secondWatchId,
          discordUserId: "111122223333444455",
          productId: secondProductId,
          targetPrice: 5_000,
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: messages.length,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now,
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 2,
      dueCount: 2,
      processedCount: 2,
      sentCount: 2,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendDirectMessages).toHaveBeenCalledTimes(1);
    expect(sendDirectMessages).toHaveBeenCalledWith("111122223333444455", [
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            title: "商品目標價達標",
            description: expect.stringContaining("共有 **2** 項追蹤達到目標價格。"),
          }),
        ],
      }),
    ]);
    const digest = JSON.stringify(sendDirectMessages.mock.calls[0]?.[1]);
    expect(digest).toContain("RTX 5070 測試卡");
    expect(digest).toContain("DDR5 64GB 測試記憶體");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledTimes(2);
    expect(client.discordNotificationDelivery.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        kind: "TARGET_PRICE",
        status: "SENT",
        targetPriceWatchId: WATCH_ROW_ID,
        messageCount: 1,
      }),
    });
    expect(client.discordNotificationDelivery.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        kind: "TARGET_PRICE",
        status: "SENT",
        targetPriceWatchId: secondWatchId,
        messageCount: 1,
      }),
    });
  });

  it("splits long target price notification digests into multiple embeds", async () => {
    const snapshots = Array.from({ length: 25 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");
      const productId = `50000000-0000-4000-8000-${suffix}-${"x".repeat(160)}`;

      return snapshot({
        id: `snapshot-target-${index + 1}`,
        productId,
        productName: `超長商品名稱測試 ${index + 1} RTX 5090 WHITE OC 32GB GDDR7 三風扇 顯示卡 限量版本 搭優惠到月底`,
        crawlRunId: "new-run",
        price: 30_000 + index,
        capturedAt: "2026-06-07T04:55:00.000Z",
      });
    });
    const watches = snapshots.map((item, index) =>
      targetPriceWatch({
        id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        discordUserId: "111122223333444455",
        productId: item.productId,
        targetPrice: 35_000 + index,
      }),
    );
    const client = createDiscordBotClient(snapshots, [], watches);
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: messages.length,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({
      processedCount: 25,
      sentCount: 25,
    });

    const messages = sendDirectMessages.mock.calls[0]?.[1] ?? [];
    const embedCount = messages.reduce(
      (count, message) => count + (message.embeds?.length ?? 0),
      0,
    );

    expect(sendDirectMessages).toHaveBeenCalledTimes(1);
    expect(embedCount).toBeGreaterThan(1);
    expect(messages[0]?.embeds?.[0]?.title).toMatch(/^商品目標價達標 \(1\/[0-9]+\)$/);
    expect(messages.at(-1)?.embeds?.at(-1)?.title).toBe(
      `商品目標價達標 (${embedCount}/${embedCount})`,
    );
  });

  it("does not send when the current price is above the target", async () => {
    const client = createWatchManagerClient();
    const sendDirectMessages = vi.fn();

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 1,
      dueCount: 0,
      processedCount: 0,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });
    expect(sendDirectMessages).not.toHaveBeenCalled();
    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    expect(client.discordNotificationDelivery.create).not.toHaveBeenCalled();
  });

  it("releases a failed delivery claim so a later scan can retry", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "snapshot-target-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 15_000,
          capturedAt: "2026-06-07T04:55:00.000Z",
        }),
      ],
      [],
      [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "failed" as const,
        messageCount: 1,
        sentMessageCount: 0,
        httpStatus: 403,
        message: "DM forbidden",
      }),
    );

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({ processedCount: 1, failedCount: 1 });
    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:05:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({ processedCount: 1, failedCount: 1 });

    expect(sendDirectMessages).toHaveBeenCalledTimes(2);
    expect(client.discordNotificationDelivery.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        kind: "TARGET_PRICE",
        status: "FAILED",
        dedupeKey: null,
        deliveredAt: null,
        errorMessage: "DM forbidden",
      }),
    });
  });

  it("does not take over a fresh notification claim", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "snapshot-target-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 15_000,
          capturedAt: "2026-06-07T04:55:00.000Z",
        }),
      ],
      [],
      [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
          notificationClaimedAt: new Date("2026-06-07T04:55:00.000Z"),
        }),
      ],
    );
    const sendDirectMessages = vi.fn();

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({ scannedCount: 0, processedCount: 0 });
    expect(sendDirectMessages).not.toHaveBeenCalled();
  });
});

describe("sendPriceReportNow", () => {
  it("sends a recent price report in the command context and records the delivery", async () => {
    const client = createDiscordBotClient([
      snapshot({
        id: "old-1",
        productId: "product-1",
        productName: "華碩 GPU A",
        categoryIgrp: 12,
        categoryName: "顯示卡",
        vendorName: "華碩",
        crawlRunId: "old-run",
        price: 12000,
        capturedAt: "2026-06-06T01:00:00.000Z",
      }),
      snapshot({
        id: "new-1",
        productId: "product-1",
        productName: "華碩 GPU A",
        categoryIgrp: 12,
        categoryName: "顯示卡",
        vendorName: "華碩",
        crawlRunId: "new-run",
        price: 10990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "new-2",
        productId: "product-2",
        productName: "Samsung SSD B",
        categoryIgrp: 8,
        categoryName: "SSD/硬碟",
        vendorName: "Samsung",
        crawlRunId: "new-run",
        price: 2490,
        capturedAt: "2026-06-07T04:00:00.000Z",
      }),
    ]);
    const sendReportMessages = vi.fn(async (_messages: DiscordBotMessage[]) => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));

    await expect(
      sendPriceReportNow({
        client,
        discordUserId: "111122223333444455",
        windowHours: 24,
        maxItems: 50,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendReportMessages,
      }),
    ).resolves.toEqual({
      status: "sent",
      changeCount: 1,
      newProductCount: 1,
      listedCount: 2,
      messageCount: 1,
    });

    const reportMessage = sendReportMessages.mock.calls[0]?.[0][0];
    expect(reportMessage).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "PartsRadarTW 價格報告 - 價格變動",
          description: expect.stringContaining("過去 **24 小時**：**降價 1**，**漲價 0**"),
        }),
        expect.objectContaining({
          title: "PartsRadarTW 價格報告 - 新增商品",
          description: expect.stringContaining("過去 **24 小時**：**1 個新增商品**"),
        }),
      ],
    });
    const priceChangeDescription = reportMessage?.embeds?.[0]?.description ?? "";
    const newProductDescription = reportMessage?.embeds?.[1]?.description ?? "";

    expect(priceChangeDescription).toContain(
      "\n__**降價 (1)**__\n**顯示卡**\n**華碩**\n- **-NT$1,010** NT$12,000 -> NT$10,990 [GPU A]",
    );
    expect(newProductDescription).toContain("\n**SSD/硬碟**\n**Samsung**\n- **NT$2,490** [SSD B]");
    expect(reportMessage?.embeds?.[0]?.fields).toBeUndefined();
    expect(reportMessage?.embeds?.[1]?.fields).toBeUndefined();
    expect(JSON.stringify(reportMessage)).toContain("GPU A");
    expect(JSON.stringify(reportMessage)).toContain("SSD B");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: {
        discordUserId: "111122223333444455",
        kind: "PRICE_REPORT_NOW",
        status: "SENT",
        itemCount: 2,
        messageCount: 1,
        deliveredAt: new Date("2026-06-07T05:00:00.000Z"),
        errorMessage: null,
      },
    });
  });

  it("keeps long report content continuous without blank embed fields", async () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      snapshot({
        id: `new-${index}`,
        productId: `product-${index}`,
        productName: `Long New Product ${index} ${"A".repeat(90)}`,
        crawlRunId: "new-run",
        price: 1000 + index,
        capturedAt: `2026-06-07T03:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const client = createDiscordBotClient(snapshots);
    const sendReportMessages = vi.fn(async (_messages: DiscordBotMessage[]) => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));

    await sendPriceReportNow({
      client,
      discordUserId: "111122223333444455",
      windowHours: 24,
      maxItems: 50,
      publicBaseUrl: PUBLIC_BASE_URL,
      now: new Date("2026-06-07T05:00:00.000Z"),
      sendReportMessages,
    });

    const reportMessage = sendReportMessages.mock.calls[0]?.[0][0];
    const description = reportMessage?.embeds?.[0]?.description ?? "";

    expect(reportMessage?.embeds?.[0]?.fields).toBeUndefined();
    expect(description).toContain("**顯示卡**\n**華碩**\n- **NT$1,013** [Long New Product 13");
    expect(description).not.toContain("\u200b");
    expect(description).not.toContain("續");
  });

  it("filters price reports by category and event type", async () => {
    const client = createDiscordBotClient([
      snapshot({
        id: "old-gpu",
        productId: "product-gpu",
        productName: "GPU A",
        crawlRunId: "old-run",
        price: 12_000,
        capturedAt: "2026-06-06T01:00:00.000Z",
        categoryIgrp: 12,
        categoryName: "顯示卡",
      }),
      snapshot({
        id: "new-gpu",
        productId: "product-gpu",
        productName: "GPU A",
        crawlRunId: "new-run",
        price: 10_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
        categoryIgrp: 12,
        categoryName: "顯示卡",
      }),
      snapshot({
        id: "old-board",
        productId: "product-board",
        productName: "Board A",
        crawlRunId: "old-run",
        price: 6_000,
        capturedAt: "2026-06-06T01:00:00.000Z",
        categoryIgrp: 5,
        categoryName: "主機板",
      }),
      snapshot({
        id: "new-board",
        productId: "product-board",
        productName: "Board A",
        crawlRunId: "new-run",
        price: 6_500,
        capturedAt: "2026-06-07T03:00:00.000Z",
        categoryIgrp: 5,
        categoryName: "主機板",
      }),
      snapshot({
        id: "new-ssd",
        productId: "product-ssd",
        productName: "SSD B",
        crawlRunId: "new-run",
        price: 2_490,
        capturedAt: "2026-06-07T03:30:00.000Z",
        categoryIgrp: 7,
        categoryName: "SSD / HDD",
        vendorSlug: "samsung",
        vendorName: "Samsung",
      }),
    ]);
    const sendReportMessages = vi.fn(async (_messages: DiscordBotMessage[]) => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));

    await expect(
      sendPriceReportNow({
        client,
        discordUserId: "111122223333444455",
        windowHours: 24,
        maxItems: 50,
        publicBaseUrl: PUBLIC_BASE_URL,
        filters: {
          categoryIgrps: [12],
          productKeyword: null,
          includePriceDrops: true,
          includePriceRises: false,
          includeNewProducts: false,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendReportMessages,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      changeCount: 1,
      newProductCount: 0,
      listedCount: 1,
    });

    const reportMessage = sendReportMessages.mock.calls[0]?.[0][0];

    expect(JSON.stringify(reportMessage)).toContain("GPU A");
    expect(JSON.stringify(reportMessage)).not.toContain("Board A");
    expect(JSON.stringify(reportMessage)).not.toContain("SSD B");
    expect(client.priceSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          product: {
            sourceCategory: {
              igrp: {
                in: [12],
              },
            },
          },
        }),
      }),
    );
  });

  it("filters price reports by product keyword", async () => {
    const client = createDiscordBotClient([
      snapshot({
        id: "old-rtx",
        productId: "product-rtx",
        productName: "華碩 ROG-RTX5090-O32G",
        crawlRunId: "old-run",
        price: 120_000,
        capturedAt: "2026-06-06T01:00:00.000Z",
      }),
      snapshot({
        id: "new-rtx",
        productId: "product-rtx",
        productName: "華碩 ROG-RTX5090-O32G",
        crawlRunId: "new-run",
        price: 118_000,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "old-rx",
        productId: "product-rx",
        productName: "華碩 PRIME-RX9070XT-O16G",
        crawlRunId: "old-run",
        price: 28_000,
        capturedAt: "2026-06-06T01:00:00.000Z",
      }),
      snapshot({
        id: "new-rx",
        productId: "product-rx",
        productName: "華碩 PRIME-RX9070XT-O16G",
        crawlRunId: "new-run",
        price: 27_000,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "new-ddr5",
        productId: "product-ddr5",
        productName: "芝奇 DDR5 6400 記憶體",
        crawlRunId: "new-run",
        price: 12_000,
        capturedAt: "2026-06-07T04:00:00.000Z",
        categoryIgrp: 6,
        categoryName: "記憶體",
      }),
    ]);
    const sendReportMessages = vi.fn(async (_messages: DiscordBotMessage[]) => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));

    await expect(
      sendPriceReportNow({
        client,
        discordUserId: "111122223333444455",
        windowHours: 24,
        maxItems: 50,
        publicBaseUrl: PUBLIC_BASE_URL,
        filters: {
          categoryIgrps: [],
          productKeyword: "RTX 5090, DDR5",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: true,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendReportMessages,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      changeCount: 1,
      newProductCount: 1,
      listedCount: 2,
    });

    const reportMessage = sendReportMessages.mock.calls[0]?.[0][0];

    expect(JSON.stringify(reportMessage)).toContain("ROG-RTX5090-O32G");
    expect(JSON.stringify(reportMessage)).toContain("DDR5 6400");
    expect(JSON.stringify(reportMessage)).not.toContain("PRIME-RX9070XT-O16G");
    expect(client.priceSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          product: expect.objectContaining({
            OR: [
              {
                AND: [
                  { name: { contains: "RTX", mode: "insensitive" } },
                  { name: { contains: "5090", mode: "insensitive" } },
                ],
              },
              { name: { contains: "DDR5", mode: "insensitive" } },
            ],
          }),
        }),
      }),
    );
  });

  it("creates public price-change report messages with the bot embed format", () => {
    const messages = createPublicPriceChangeReportMessages(
      [
        {
          productId: "product-1",
          productName: "華碩 GPU A",
          category: { igrp: 12, displayName: "顯示卡" },
          subcategory: { slug: "asus", displayName: "華碩" },
          previousPrice: 12_000,
          currentPrice: 10_990,
          currency: "TWD",
          changedAt: new Date("2026-06-07T03:00:00.000Z"),
          delta: -1010,
        },
      ],
      {
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 50,
        generatedAt: new Date("2026-06-07T05:00:00.000Z"),
      },
    );

    expect(messages).toEqual([
      {
        embeds: [
          expect.objectContaining({
            title: "PartsRadarTW 公開價格報告 - 價格變動",
            description: expect.stringContaining("本輪更新：**降價 1**，**漲價 0**"),
          }),
        ],
      },
    ]);
    expect(messages[0]?.embeds?.[0]?.description).toContain(
      "\n__**降價 (1)**__\n**顯示卡**\n**華碩**\n- **-NT$1,010** NT$12,000 -> NT$10,990 [GPU A]",
    );
    expect(messages[0]?.embeds?.[0]?.fields).toBeUndefined();
  });

  it("shows the public report settings panel from the public-report command", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction(),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(requestBody).toMatchObject({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          expect.objectContaining({
            title: "公開價格報告設定",
            description: expect.stringContaining("排程爬蟲完成且有價格變動"),
            fields: expect.arrayContaining([
              expect.objectContaining({ name: "狀態", value: "尚未設定" }),
              expect.objectContaining({ name: "發送頻道", value: "尚未設定" }),
              expect.objectContaining({ name: "目前頻道", value: "<#999988887777666655>" }),
            ]),
          }),
        ],
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                custom_id: "public-report:set-channel",
                label: "設為此頻道",
              }),
              expect.objectContaining({
                custom_id: "public-report:preview",
                disabled: true,
              }),
            ]),
          }),
        ]),
      },
    });
  });

  it("sets the current channel as the public report channel", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportButtonInteraction("public-report:set-channel"),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ type: 6 });
    expect(client.discordPublicPriceReportSetting.upsert).toHaveBeenCalledWith({
      where: {
        discordGuildId: "guild-1",
      },
      create: expect.objectContaining({
        discordGuildId: "guild-1",
        channelId: "999988887777666655",
        enabled: true,
        createdByDiscordUserId: "111122223333444455",
        updatedByDiscordUserId: "111122223333444455",
      }),
      update: expect.objectContaining({
        channelId: "999988887777666655",
        enabled: true,
        updatedByDiscordUserId: "111122223333444455",
      }),
      select: expect.any(Object),
    });

    const updateBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(updateBody.embeds)).toContain("已將公開報告頻道設為");
    expect(JSON.stringify(updateBody.components)).toContain("public-report:preview");
    expect(JSON.stringify(updateBody.components)).toContain("public-report:disable");
  });

  it("sends a public report preview to the configured channel", async () => {
    const now = new Date();
    const oldCapturedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const newCapturedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "public-preview-old",
          productId: "public-preview-product",
          productName: "華碩 GPU A",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: oldCapturedAt,
        }),
        snapshot({
          id: "public-preview-new",
          productId: "public-preview-product",
          productName: "華碩 GPU A",
          crawlRunId: "new-run",
          price: 10_990,
          capturedAt: newCapturedAt,
        }),
      ],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [],
      [publicPriceReportSetting({ id: "public-setting-1" })],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportButtonInteraction("public-report:preview"),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: 5,
      data: { flags: 64 },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${API_BASE_URL}/channels/999988887777666655/messages`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "PartsRadarTW 公開價格報告 - 價格變動",
          description: expect.stringContaining("GPU A"),
        }),
      ],
      allowed_mentions: {
        parse: [],
      },
    });
    const responseBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(responseBody.content).toContain("已發送測試公開報告到 <#999988887777666655>");
  });

  it("sends pending public price reports to the configured channel", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "old-public-1",
          productId: "product-public-1",
          productName: "華碩 GPU A",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-public-1",
          productId: "product-public-1",
          productName: "華碩 GPU A",
          crawlRunId: "public-run-1",
          price: 10_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [
        crawlRun({
          id: "public-run-1",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      [publicPriceReportSetting({ id: "public-setting-1" })],
    );
    const sendChannelMessages = vi.fn(
      async (_channelId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
      }),
    ).resolves.toEqual({
      settingCount: 1,
      processedCount: 1,
      sentCount: 1,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendChannelMessages).toHaveBeenCalledWith(
      "999988887777666655",
      expect.arrayContaining([
        expect.objectContaining({
          embeds: [
            expect.objectContaining({
              title: "PartsRadarTW 公開價格報告 - 價格變動",
              description: expect.stringContaining("GPU A"),
            }),
          ],
        }),
      ]),
    );
    expect(client.discordPublicPriceReportDelivery.upsert).toHaveBeenCalledWith({
      where: {
        crawlRunId_channelId: {
          crawlRunId: "public-run-1",
          channelId: "999988887777666655",
        },
      },
      create: expect.objectContaining({
        crawlRunId: "public-run-1",
        channelId: "999988887777666655",
        status: "SENT",
        itemCount: 1,
        messageCount: 1,
        deliveredAt: new Date("2026-06-07T05:00:00.000Z"),
      }),
      update: expect.objectContaining({
        status: "SENT",
        itemCount: 1,
        messageCount: 1,
        deliveredAt: new Date("2026-06-07T05:00:00.000Z"),
      }),
    });
  });

  it("skips public price reports when no public report setting is configured", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [crawlRun({ id: "public-run-1" })],
    );
    const sendChannelMessages = vi.fn();

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
      }),
    ).resolves.toEqual({
      settingCount: 0,
      processedCount: 0,
      sentCount: 0,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(client.crawlRun.findMany).not.toHaveBeenCalled();
    expect(sendChannelMessages).not.toHaveBeenCalled();
  });

  it("does not resend public reports that were already delivered", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [
        publicPriceReportDelivery({
          id: "public-delivery-1",
          crawlRunId: "public-run-1",
          channelId: "999988887777666655",
          status: "SENT",
        }),
      ],
      [crawlRun({ id: "public-run-1" })],
      [publicPriceReportSetting({ id: "public-setting-1" })],
    );
    const sendChannelMessages = vi.fn();

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
      }),
    ).resolves.toEqual({
      settingCount: 1,
      processedCount: 0,
      sentCount: 0,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendChannelMessages).not.toHaveBeenCalled();
  });

  it("enables daily report settings for a Discord user", async () => {
    const client = createDiscordBotClient([]);
    const setting = await enableDailyPriceReport({
      client,
      discordUserId: "111122223333444455",
      windowHours: 12,
      maxItems: 10,
      now: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(setting).toMatchObject({
      discordUserId: "111122223333444455",
      interval: "DAILY",
      window: "HOURS_12",
      maxItems: 10,
      enabled: true,
      nextSendAt: new Date("2026-06-08T05:00:00.000Z"),
    });
    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          discordUserId: "111122223333444455",
        },
      }),
    );
  });

  it("enables daily report settings at a specific Taipei time", async () => {
    const client = createDiscordBotClient([]);
    const setting = await enableDailyPriceReport({
      client,
      discordUserId: "111122223333444455",
      windowHours: 24,
      maxItems: 50,
      timeOfDay: {
        hour: 21,
        minute: 30,
      },
      now: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(setting).toMatchObject({
      nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
    });
  });

  it("sends due scheduled daily reports by DM and advances the next run", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "old-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "old-run",
          price: 12000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "new-run",
          price: 10990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueScheduledPriceReports({
        client,
        options: {
          publicBaseUrl: PUBLIC_BASE_URL,
          priceReportMaxItems: 50,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      processedCount: 1,
      sentCount: 1,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendDirectMessages).toHaveBeenCalledWith(
      "111122223333444455",
      expect.arrayContaining([
        expect.objectContaining({
          embeds: [expect.objectContaining({ title: "PartsRadarTW 價格報告 - 價格變動" })],
        }),
      ]),
    );
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordUserId: "111122223333444455",
        kind: "SCHEDULED_PRICE_REPORT",
        status: "SENT",
      }),
    });
    expect(client.discordPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
      },
      data: {
        lastSentAt: new Date("2026-06-07T05:00:00.000Z"),
        nextSendAt: new Date("2026-06-08T04:59:00.000Z"),
      },
    });
  });

  it("keeps the configured daily send time when advancing scheduled reports", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "new-run",
          price: 10990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T01:30:00.000Z"),
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await sendDueScheduledPriceReports({
      client,
      options: {
        publicBaseUrl: PUBLIC_BASE_URL,
        priceReportMaxItems: 50,
      },
      now: new Date("2026-06-07T05:00:00.000Z"),
      sendDirectMessages,
    });

    expect(client.discordPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
      },
      data: {
        lastSentAt: new Date("2026-06-07T05:00:00.000Z"),
        nextSendAt: new Date("2026-06-08T01:30:00.000Z"),
      },
    });
  });

  it("calculates precise scheduled report sleeps without busy polling", () => {
    const now = new Date("2026-06-07T05:00:00.000Z");

    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: new Date("2026-06-07T05:02:30.000Z"),
        maxSleepMs: 300_000,
      }),
    ).toBe(150_000);
    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: new Date("2026-06-07T05:10:00.000Z"),
        maxSleepMs: 300_000,
      }),
    ).toBe(300_000);
    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: new Date("2026-06-07T04:59:59.000Z"),
        maxSleepMs: 300_000,
      }),
    ).toBe(1000);
    expect(
      calculateScheduledPriceReportSleepMs({
        now,
        nextDueAt: null,
        maxSleepMs: 300_000,
      }),
    ).toBe(300_000);
  });

  it("reads the earliest enabled scheduled price report due time", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-later",
          discordUserId: "222233334444555566",
          nextSendAt: new Date("2026-06-07T06:00:00.000Z"),
        }),
        priceReportSetting({
          id: "setting-disabled",
          discordUserId: "333344445555666677",
          nextSendAt: new Date("2026-06-07T04:00:00.000Z"),
          enabled: false,
        }),
        priceReportSetting({
          id: "setting-earlier",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T05:00:00.000Z"),
        }),
      ],
    );

    await expect(readNextScheduledPriceReportDueAt({ client })).resolves.toEqual(
      new Date("2026-06-07T05:00:00.000Z"),
    );
    expect(client.discordPriceReportSetting.findFirst).toHaveBeenCalledWith({
      where: {
        enabled: true,
        nextSendAt: {
          not: null,
        },
      },
      select: {
        nextSendAt: true,
      },
      orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
    });
  });
});

function createDiscordBotOptions(): DiscordBotOptions {
  return {
    token: TOKEN,
    applicationId: APPLICATION_ID,
    publicBaseUrl: PUBLIC_BASE_URL,
    apiBaseUrl: API_BASE_URL,
    gatewayUrl: "wss://discord.test/gateway",
    registerCommands: false,
    registerCommandsOnStart: true,
    priceReportMaxItems: 50,
    commandCooldownSeconds: 60,
    priceReportScheduleIntervalSeconds: 300,
  };
}

function readResponseEmbed(body: {
  data?: { embeds?: DiscordBotEmbed[] };
  embeds?: DiscordBotEmbed[];
}): DiscordBotEmbed {
  const embed = body.data?.embeds?.[0] ?? body.embeds?.[0];

  if (!embed) {
    throw new Error("Expected response body to include an embed.");
  }

  return embed;
}

function readEmbedFieldValue(embed: DiscordBotEmbed, fieldName: string): string | undefined {
  return embed.fields?.find((field) => field.name === fieldName)?.value;
}

function createInteraction(
  subcommandName: string,
  subcommandOptions: NonNullable<NonNullable<DiscordInteraction["data"]>["options"]> = [],
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 2,
    data: {
      name: "price-report",
      options: [
        {
          type: 1,
          name: subcommandName,
          options: subcommandOptions,
        },
      ],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createPublicReportInteraction({
  guildId = "guild-1",
  channelId = "999988887777666655",
}: {
  guildId?: string;
  channelId?: string;
} = {}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 2,
    guild_id: guildId,
    channel_id: channelId,
    data: {
      name: "public-report",
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createPublicReportButtonInteraction(
  customId: string,
  {
    guildId = "guild-1",
    channelId = "999988887777666655",
  }: {
    guildId?: string;
    channelId?: string;
  } = {},
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    guild_id: guildId,
    channel_id: channelId,
    data: {
      custom_id: customId,
      component_type: 2,
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createComponentInteraction(customId: string): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: customId,
      component_type: 2,
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createSelectComponentInteraction(customId: string, values: string[]): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: customId,
      component_type: 3,
      values,
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createSettingsModalSubmitInteraction({
  maxItems = "50",
  time = "09:00",
}: {
  maxItems?: string;
  time?: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: "price-report:settings:time-limit-modal",
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "price-report:settings:max-items",
            value: maxItems,
          },
        },
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "price-report:settings:time",
            value: time,
          },
        },
      ],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createKeywordModalSubmitInteraction({ keyword }: { keyword: string }): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: "price-report:settings:keyword-modal",
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "price-report:settings:keyword-input",
            value: keyword,
          },
        },
      ],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createWatchOpenInteraction(): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 2,
    data: {
      name: "watch",
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createWatchModalSubmitInteraction({
  productInput,
  targetPrice,
}: {
  productInput: string;
  targetPrice: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: "watch:create-modal",
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "watch:product",
            value: productInput,
          },
        },
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "watch:target-price",
            value: targetPrice,
          },
        },
      ],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createWatchButtonInteraction(customId: string): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: customId,
      component_type: 2,
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createWatchSelectInteraction(watchInput: string, page: number): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: `watch:select:${page}`,
      component_type: 3,
      values: [watchInput],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

function createWatchEditModalSubmitInteraction({
  watchId,
  targetPrice,
  page,
}: {
  watchId: string;
  targetPrice: string;
  page: number;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: `watch:edit-modal:${watchId}:${page}`,
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "watch:target-price",
            value: targetPrice,
          },
        },
      ],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

interface TestSnapshot {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  currency: string;
  capturedAt: Date;
  categoryIgrp: number;
  categoryName: string;
  vendorSlug: string | null;
  vendorName: string | null;
}

interface TestPriceReportSetting {
  id: string;
  discordUserId: string;
  interval: "DAILY" | "EVERY_12H" | "EVERY_6H";
  window: "HOURS_24" | "HOURS_12" | "HOURS_6";
  scope: "ALL" | "WATCHLIST";
  timezone: string;
  maxItems: number;
  categoryIgrps: number[];
  productKeyword: string | null;
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
  enabled: boolean;
  nextSendAt: Date | null;
  lastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestSourceCategory {
  igrp: number;
  displayName: string;
}

interface TestProductWhere {
  sourceCategory?: {
    igrp?: {
      in?: number[];
    };
  };
  name?: {
    contains?: string;
  };
  AND?: TestProductWhere[];
  OR?: TestProductWhere[];
}

interface TestTargetPriceWatch {
  id: string;
  discordUserId: string;
  productId: string;
  targetPrice: number;
  currency: string;
  enabled: boolean;
  lastNotifiedAt: Date | null;
  notificationClaimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestDiscordNotificationDelivery {
  id: string;
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE";
  status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
  productId: string | null;
  targetPriceWatchId: string | null;
  dedupeKey: string | null;
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

interface TestDiscordPublicPriceReportDelivery {
  id: string;
  crawlRunId: string;
  channelId: string;
  status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestDiscordPublicPriceReportSetting {
  id: string;
  discordGuildId: string;
  channelId: string;
  enabled: boolean;
  createdByDiscordUserId: string;
  updatedByDiscordUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestCrawlRun {
  id: string;
  status: "SUCCESS_CHANGED" | "SUCCESS_WITH_ERRORS" | "SUCCESS_UNCHANGED";
  triggerType: "SCHEDULED" | "MANUAL";
  finishedAt: Date | null;
}

function snapshot({
  id,
  productId,
  productName,
  crawlRunId,
  price,
  capturedAt,
  currency = "TWD",
  categoryIgrp = 12,
  categoryName = "顯示卡",
  vendorSlug = "asus",
  vendorName = "華碩",
}: {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  capturedAt: string;
  currency?: string;
  categoryIgrp?: number;
  categoryName?: string;
  vendorSlug?: string | null;
  vendorName?: string | null;
}): TestSnapshot {
  return {
    id,
    productId,
    productName,
    crawlRunId,
    price,
    currency,
    capturedAt: new Date(capturedAt),
    categoryIgrp,
    categoryName,
    vendorSlug,
    vendorName,
  };
}

function priceReportSetting({
  id,
  discordUserId,
  nextSendAt,
  interval = "DAILY",
  window = "HOURS_24",
  maxItems = 50,
  categoryIgrps = [],
  productKeyword = null,
  includePriceDrops = true,
  includePriceRises = true,
  includeNewProducts = true,
  enabled = true,
}: {
  id: string;
  discordUserId: string;
  nextSendAt: Date | null;
  interval?: TestPriceReportSetting["interval"];
  window?: TestPriceReportSetting["window"];
  maxItems?: number;
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
  enabled?: boolean;
}): TestPriceReportSetting {
  return {
    id,
    discordUserId,
    interval,
    window,
    scope: "ALL",
    timezone: "Asia/Taipei",
    maxItems,
    categoryIgrps,
    productKeyword,
    includePriceDrops,
    includePriceRises,
    includeNewProducts,
    enabled,
    nextSendAt,
    lastSentAt: null,
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt: new Date("2026-06-07T00:00:00.000Z"),
  };
}

function targetPriceWatch({
  id,
  discordUserId,
  productId,
  targetPrice,
  currency = "TWD",
  enabled = true,
  lastNotifiedAt = null,
  notificationClaimedAt = null,
}: {
  id: string;
  discordUserId: string;
  productId: string;
  targetPrice: number;
  currency?: string;
  enabled?: boolean;
  lastNotifiedAt?: Date | null;
  notificationClaimedAt?: Date | null;
}): TestTargetPriceWatch {
  return {
    id,
    discordUserId,
    productId,
    targetPrice,
    currency,
    enabled,
    lastNotifiedAt,
    notificationClaimedAt,
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt: new Date("2026-06-07T00:00:00.000Z"),
  };
}

function notificationDelivery({
  id,
  discordUserId,
  kind,
  status = "SENT",
  productId = null,
  targetPriceWatchId = null,
  dedupeKey = null,
  itemCount = 0,
  messageCount = 0,
  deliveredAt = null,
  errorMessage = null,
  createdAt = new Date("2026-06-07T00:00:00.000Z"),
}: {
  id: string;
  discordUserId: string;
  kind: TestDiscordNotificationDelivery["kind"];
  status?: TestDiscordNotificationDelivery["status"];
  productId?: string | null;
  targetPriceWatchId?: string | null;
  dedupeKey?: string | null;
  itemCount?: number;
  messageCount?: number;
  deliveredAt?: Date | null;
  errorMessage?: string | null;
  createdAt?: Date;
}): TestDiscordNotificationDelivery {
  return {
    id,
    discordUserId,
    kind,
    status,
    productId,
    targetPriceWatchId,
    dedupeKey,
    itemCount,
    messageCount,
    deliveredAt,
    errorMessage,
    createdAt,
  };
}

function publicPriceReportDelivery({
  id,
  crawlRunId,
  channelId,
  status = "SENT",
  itemCount = 0,
  messageCount = 0,
  deliveredAt = null,
  errorMessage = null,
  createdAt = new Date("2026-06-07T00:00:00.000Z"),
  updatedAt = new Date("2026-06-07T00:00:00.000Z"),
}: {
  id: string;
  crawlRunId: string;
  channelId: string;
  status?: TestDiscordPublicPriceReportDelivery["status"];
  itemCount?: number;
  messageCount?: number;
  deliveredAt?: Date | null;
  errorMessage?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}): TestDiscordPublicPriceReportDelivery {
  return {
    id,
    crawlRunId,
    channelId,
    status,
    itemCount,
    messageCount,
    deliveredAt,
    errorMessage,
    createdAt,
    updatedAt,
  };
}

function publicPriceReportSetting({
  id,
  discordGuildId = "guild-1",
  channelId = "999988887777666655",
  enabled = true,
  createdByDiscordUserId = "111122223333444455",
  updatedByDiscordUserId = "111122223333444455",
  createdAt = new Date("2026-06-07T00:00:00.000Z"),
  updatedAt = new Date("2026-06-07T00:00:00.000Z"),
}: {
  id: string;
  discordGuildId?: string;
  channelId?: string;
  enabled?: boolean;
  createdByDiscordUserId?: string;
  updatedByDiscordUserId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}): TestDiscordPublicPriceReportSetting {
  return {
    id,
    discordGuildId,
    channelId,
    enabled,
    createdByDiscordUserId,
    updatedByDiscordUserId,
    createdAt,
    updatedAt,
  };
}

function crawlRun({
  id,
  status = "SUCCESS_CHANGED",
  triggerType = "SCHEDULED",
  finishedAt = new Date("2026-06-07T03:05:00.000Z"),
}: {
  id: string;
  status?: TestCrawlRun["status"];
  triggerType?: TestCrawlRun["triggerType"];
  finishedAt?: Date | null;
}): TestCrawlRun {
  return {
    id,
    status,
    triggerType,
    finishedAt,
  };
}

function createWatchManagerClient() {
  return createDiscordBotClient(
    [
      snapshot({
        id: "snapshot-watch-1",
        productId: WATCH_PRODUCT_ID,
        productName: "RTX 5070 測試卡",
        crawlRunId: "new-run",
        price: 18_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
    ],
    [],
    [
      targetPriceWatch({
        id: WATCH_ROW_ID,
        discordUserId: "111122223333444455",
        productId: WATCH_PRODUCT_ID,
        targetPrice: 17_500,
      }),
    ],
  );
}

function createDiscordBotClient(
  snapshots: TestSnapshot[],
  settings: TestPriceReportSetting[] = [],
  watches: TestTargetPriceWatch[] = [],
  categories: TestSourceCategory[] = [...TEST_SOURCE_CATEGORIES],
  deliveries: TestDiscordNotificationDelivery[] = [],
  publicPriceReportDeliveries: TestDiscordPublicPriceReportDelivery[] = [],
  crawlRuns: TestCrawlRun[] = [],
  publicPriceReportSettings: TestDiscordPublicPriceReportSetting[] = [],
): DiscordBotClient & {
  crawlRun: {
    findMany: ReturnType<typeof vi.fn>;
  };
  sourceCategory: {
    findMany: ReturnType<typeof vi.fn>;
  };
  product: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  priceSnapshot: {
    findMany: ReturnType<typeof vi.fn>;
  };
  discordNotificationDelivery: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  discordPublicPriceReportDelivery: {
    findFirst: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  discordPublicPriceReportSetting: {
    deleteMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  discordPriceReportSetting: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  discordTargetPriceWatch: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
} {
  const productFindFirst = vi.fn(async (args: { where: { id?: string } }) => {
    const productId = args.where.id;
    const latestSnapshot = snapshots
      .filter((snapshot) => snapshot.productId === productId)
      .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0];

    return latestSnapshot ? toPrismaWatchProduct(latestSnapshot) : null;
  });
  const sourceCategories = [
    ...categories,
    ...snapshots.map((item) => ({ igrp: item.categoryIgrp, displayName: item.categoryName })),
  ].filter(
    (category, index, allCategories) =>
      allCategories.findIndex((item) => item.igrp === category.igrp) === index,
  );
  const sourceCategoryFindMany = vi.fn(
    async (_args: {
      where: { enabled: boolean };
      select: { igrp: boolean; displayName: boolean };
      orderBy: Array<Record<string, string>>;
    }) => sourceCategories.sort((left, right) => left.igrp - right.igrp),
  );
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;
    const productFilter = where.product as TestProductWhere | undefined;

    if (typeof where.crawlRunId === "string") {
      return snapshots
        .filter((snapshot) => snapshot.crawlRunId === where.crawlRunId)
        .sort(compareCapturedAtAsc)
        .map(toPrismaSnapshotWithProduct);
    }

    if (
      !where.productId &&
      typeof where.capturedAt === "object" &&
      where.capturedAt !== null &&
      "gte" in where.capturedAt &&
      "lte" in where.capturedAt
    ) {
      const capturedAtFilter = where.capturedAt as { gte: Date; lte: Date };

      return snapshots
        .filter(
          (snapshot) =>
            snapshot.capturedAt.getTime() >= capturedAtFilter.gte.getTime() &&
            snapshot.capturedAt.getTime() <= capturedAtFilter.lte.getTime() &&
            matchesProductWhere(snapshot, productFilter),
        )
        .sort(compareCapturedAtAsc)
        .map(toPrismaSnapshotWithProduct);
    }

    const productIdFilter = where.productId as { in: string[] };
    const capturedAtFilter = where.capturedAt as { lt: Date };

    return snapshots
      .filter(
        (snapshot) =>
          productIdFilter.in.includes(snapshot.productId) &&
          snapshot.capturedAt.getTime() < capturedAtFilter.lt.getTime(),
      )
      .sort(comparePreviousSnapshotOrder)
      .map((snapshot) => ({
        id: snapshot.id,
        productId: snapshot.productId,
        price: snapshot.price,
        currency: snapshot.currency,
        capturedAt: snapshot.capturedAt,
      }));
  });
  const settingRows = [...settings];
  const settingFindFirst = vi.fn(
    async (args: { where: { enabled?: boolean; nextSendAt?: { not: null } } }) => {
      const rows = settingRows
        .filter((setting) => {
          if (args.where.enabled !== undefined && setting.enabled !== args.where.enabled) {
            return false;
          }

          return !args.where.nextSendAt || setting.nextSendAt !== null;
        })
        .sort((left, right) => {
          return (
            (left.nextSendAt?.getTime() ?? Number.POSITIVE_INFINITY) -
              (right.nextSendAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
            left.id.localeCompare(right.id)
          );
        });

      const setting = rows[0];

      return setting ? { nextSendAt: setting.nextSendAt } : null;
    },
  );
  const settingFindMany = vi.fn(
    async (args: { where: { nextSendAt?: { lte: Date }; enabled?: boolean } }) => {
      const nextSendAtLte = args.where.nextSendAt?.lte;

      return settingRows.filter((setting) => {
        if (args.where.enabled !== undefined && setting.enabled !== args.where.enabled) {
          return false;
        }

        return (
          !nextSendAtLte ||
          (setting.nextSendAt !== null && setting.nextSendAt.getTime() <= nextSendAtLte.getTime())
        );
      });
    },
  );
  const settingFindUnique = vi.fn(async (args: { where: { discordUserId: string } }) => {
    return (
      settingRows.find((setting) => setting.discordUserId === args.where.discordUserId) ?? null
    );
  });
  const settingUpdate = vi.fn(
    async (args: { where: { id: string }; data: Partial<TestPriceReportSetting> }) => {
      const setting = settingRows.find((row) => row.id === args.where.id);

      if (!setting) {
        throw new Error("Setting not found.");
      }

      Object.assign(setting, args.data);
      return setting;
    },
  );
  const settingUpdateMany = vi.fn(
    async (args: {
      where: { discordUserId: string; enabled?: boolean };
      data: Partial<TestPriceReportSetting>;
    }) => {
      let count = 0;

      for (const setting of settingRows) {
        if (
          setting.discordUserId === args.where.discordUserId &&
          (args.where.enabled === undefined || setting.enabled === args.where.enabled)
        ) {
          Object.assign(setting, args.data);
          count += 1;
        }
      }

      return { count };
    },
  );
  const settingUpsert = vi.fn(
    async (args: {
      where: { discordUserId: string };
      create: Pick<
        TestPriceReportSetting,
        | "discordUserId"
        | "interval"
        | "window"
        | "scope"
        | "timezone"
        | "maxItems"
        | "categoryIgrps"
        | "productKeyword"
        | "includePriceDrops"
        | "includePriceRises"
        | "includeNewProducts"
        | "enabled"
        | "nextSendAt"
      >;
      update: Partial<TestPriceReportSetting>;
    }) => {
      const existing = settingRows.find(
        (setting) => setting.discordUserId === args.where.discordUserId,
      );

      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }

      const created = {
        id: "setting-created",
        lastSentAt: null,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      settingRows.push(created);

      return created;
    },
  );
  const watchRows = [...watches];
  const toWatchRecord = (watch: TestTargetPriceWatch) => toPrismaWatchListRecord(watch, snapshots);
  type WatchWhere = {
    id?: string;
    discordUserId?: string;
    productId?: string;
    enabled?: boolean;
    lastNotifiedAt?: null;
    notificationClaimedAt?: Date | null;
    OR?: Array<{
      notificationClaimedAt: null | { lte: Date };
    }>;
    product?: unknown;
  };
  const matchesClaim = (watch: TestTargetPriceWatch, condition: null | Date | { lte: Date }) => {
    if (condition === null) {
      return watch.notificationClaimedAt === null;
    }

    if (condition instanceof Date) {
      return watch.notificationClaimedAt?.getTime() === condition.getTime();
    }

    return (
      watch.notificationClaimedAt !== null &&
      watch.notificationClaimedAt.getTime() <= condition.lte.getTime()
    );
  };
  const matchesWatchWhere = (watch: TestTargetPriceWatch, where: WatchWhere) => {
    if (where.id !== undefined && watch.id !== where.id) {
      return false;
    }

    if (where.discordUserId !== undefined && watch.discordUserId !== where.discordUserId) {
      return false;
    }

    if (where.productId !== undefined && watch.productId !== where.productId) {
      return false;
    }

    if (where.enabled !== undefined && watch.enabled !== where.enabled) {
      return false;
    }

    if (where.lastNotifiedAt === null && watch.lastNotifiedAt !== null) {
      return false;
    }

    if (
      where.notificationClaimedAt !== undefined &&
      !matchesClaim(watch, where.notificationClaimedAt)
    ) {
      return false;
    }

    if (
      where.OR &&
      !where.OR.some((condition) => matchesClaim(watch, condition.notificationClaimedAt))
    ) {
      return false;
    }

    if (where.product && !snapshots.some((snapshot) => snapshot.productId === watch.productId)) {
      return false;
    }

    return true;
  };
  const watchFindMany = vi.fn(async (args: { where: WatchWhere; skip?: number; take?: number }) => {
    const rows = watchRows
      .filter((watch) => matchesWatchWhere(watch, args.where))
      .sort((left, right) => {
        return (
          right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id)
        );
      })
      .map(toWatchRecord);
    const start = args.skip ?? 0;

    return typeof args.take === "number" ? rows.slice(start, start + args.take) : rows.slice(start);
  });
  const watchFindFirst = vi.fn(
    async (args: {
      where: { id?: string; discordUserId?: string; productId?: string; enabled?: boolean };
    }) => {
      const watch = watchRows.find((row) => {
        if (args.where.id !== undefined && row.id !== args.where.id) {
          return false;
        }

        if (
          args.where.discordUserId !== undefined &&
          row.discordUserId !== args.where.discordUserId
        ) {
          return false;
        }

        if (args.where.productId !== undefined && row.productId !== args.where.productId) {
          return false;
        }

        return args.where.enabled === undefined || row.enabled === args.where.enabled;
      });

      return watch ? toWatchRecord(watch) : null;
    },
  );
  const watchUpdateMany = vi.fn(
    async (args: { where: WatchWhere; data: Partial<TestTargetPriceWatch> }) => {
      let count = 0;

      for (const watch of watchRows) {
        if (!matchesWatchWhere(watch, args.where)) {
          continue;
        }

        Object.assign(watch, args.data);
        count += 1;
      }

      return { count };
    },
  );
  const watchUpsert = vi.fn(
    async (args: {
      where: { discordUserId_productId: { discordUserId: string; productId: string } };
      create: Pick<
        TestTargetPriceWatch,
        "discordUserId" | "productId" | "targetPrice" | "currency" | "enabled"
      >;
      update: Partial<TestTargetPriceWatch>;
    }) => {
      const key = args.where.discordUserId_productId;
      const existing = watchRows.find(
        (watch) => watch.discordUserId === key.discordUserId && watch.productId === key.productId,
      );

      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }

      const created = {
        id: "44444444-4444-4444-8444-444444444444",
        lastNotifiedAt: null,
        notificationClaimedAt: null,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      watchRows.push(created);

      return created;
    },
  );
  const deliveryRows = [...deliveries];
  const deliveryCreate = vi.fn(
    async (args: {
      data: Omit<TestDiscordNotificationDelivery, "id" | "createdAt"> & {
        id?: string;
        createdAt?: Date;
      };
    }) => {
      const created: TestDiscordNotificationDelivery = {
        id: args.data.id ?? `delivery-${deliveryRows.length + 1}`,
        createdAt: args.data.createdAt ?? new Date("2026-06-07T00:00:00.000Z"),
        ...args.data,
        productId: args.data.productId ?? null,
        targetPriceWatchId: args.data.targetPriceWatchId ?? null,
        dedupeKey: args.data.dedupeKey ?? null,
      };
      deliveryRows.push(created);

      return { id: created.id };
    },
  );
  const deliveryFindFirst = vi.fn(
    async (args: {
      where: {
        discordUserId?: string;
        kind?: TestDiscordNotificationDelivery["kind"];
        targetPriceWatchId?: string;
      };
      select?: Record<string, boolean>;
    }) => {
      const delivery = deliveryRows
        .filter((row) => {
          if (args.where.discordUserId && row.discordUserId !== args.where.discordUserId) {
            return false;
          }

          if (args.where.kind && row.kind !== args.where.kind) {
            return false;
          }

          return (
            !args.where.targetPriceWatchId ||
            row.targetPriceWatchId === args.where.targetPriceWatchId
          );
        })
        .sort((left, right) => {
          return (
            right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
          );
        })[0];

      if (!delivery) {
        return null;
      }

      if (!args.select) {
        return delivery;
      }

      return Object.fromEntries(
        Object.entries(args.select)
          .filter(([, selected]) => selected)
          .map(([key]) => [key, delivery[key as keyof TestDiscordNotificationDelivery]]),
      );
    },
  );
  const publicDeliveryRows = [...publicPriceReportDeliveries];
  const publicSettingRows = [...publicPriceReportSettings];
  const publicSettingFindMany = vi.fn(
    async (args: { where: { enabled?: boolean }; take?: number }) => {
      const rows = publicSettingRows
        .filter(
          (setting) => args.where.enabled === undefined || setting.enabled === args.where.enabled,
        )
        .sort((left, right) => {
          return (
            left.updatedAt.getTime() - right.updatedAt.getTime() || left.id.localeCompare(right.id)
          );
        });

      return typeof args.take === "number" ? rows.slice(0, args.take) : rows;
    },
  );
  const publicSettingFindUnique = vi.fn(
    async (args: { where: { discordGuildId: string } }) =>
      publicSettingRows.find((setting) => setting.discordGuildId === args.where.discordGuildId) ??
      null,
  );
  const publicSettingUpsert = vi.fn(
    async (args: {
      where: { discordGuildId: string };
      create: Omit<TestDiscordPublicPriceReportSetting, "id" | "createdAt" | "updatedAt">;
      update: Partial<TestDiscordPublicPriceReportSetting>;
    }) => {
      const existing = publicSettingRows.find(
        (setting) => setting.discordGuildId === args.where.discordGuildId,
      );

      if (existing) {
        Object.assign(existing, args.update, {
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        });
        return existing;
      }

      const created: TestDiscordPublicPriceReportSetting = {
        id: `public-setting-${publicSettingRows.length + 1}`,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      publicSettingRows.push(created);

      return created;
    },
  );
  const publicSettingUpdate = vi.fn(
    async (args: {
      where: { discordGuildId: string };
      data: Partial<TestDiscordPublicPriceReportSetting>;
    }) => {
      const setting = publicSettingRows.find(
        (row) => row.discordGuildId === args.where.discordGuildId,
      );

      if (!setting) {
        throw new Error("Public report setting not found.");
      }

      Object.assign(setting, args.data, {
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
      });

      return setting;
    },
  );
  const publicSettingDeleteMany = vi.fn(async (args: { where: { discordGuildId: string } }) => {
    const beforeCount = publicSettingRows.length;

    for (let index = publicSettingRows.length - 1; index >= 0; index -= 1) {
      if (publicSettingRows[index]?.discordGuildId === args.where.discordGuildId) {
        publicSettingRows.splice(index, 1);
      }
    }

    return { count: beforeCount - publicSettingRows.length };
  });
  const publicDeliveryFindFirst = vi.fn(
    async (args: { where: { channelId: string }; select?: Record<string, boolean> }) => {
      const delivery = publicDeliveryRows
        .filter((row) => row.channelId === args.where.channelId)
        .sort((left, right) => {
          return (
            right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
          );
        })[0];

      if (!delivery) {
        return null;
      }

      if (!args.select) {
        return delivery;
      }

      return Object.fromEntries(
        Object.entries(args.select)
          .filter(([, selected]) => selected)
          .map(([key]) => [key, delivery[key as keyof TestDiscordPublicPriceReportDelivery]]),
      );
    },
  );
  const crawlRunFindMany = vi.fn(
    async (args: {
      where: {
        triggerType?: TestCrawlRun["triggerType"];
        status?: { in: TestCrawlRun["status"][] };
        finishedAt?: { not: null };
        OR?: Array<{
          publicPriceReportDeliveries?: {
            none?: { channelId: string };
            some?: {
              channelId: string;
              status: { in: TestDiscordPublicPriceReportDelivery["status"][] };
            };
          };
        }>;
      };
      take?: number;
    }) => {
      const channelId = args.where.OR?.[0]?.publicPriceReportDeliveries?.none?.channelId;
      const retryStatuses = args.where.OR?.[1]?.publicPriceReportDeliveries?.some?.status.in ?? [];

      return crawlRuns
        .filter((run) => {
          if (args.where.triggerType && run.triggerType !== args.where.triggerType) {
            return false;
          }

          if (args.where.status?.in && !args.where.status.in.includes(run.status)) {
            return false;
          }

          if (args.where.finishedAt?.not === null && run.finishedAt === null) {
            return false;
          }

          if (!channelId) {
            return true;
          }

          const delivery = publicDeliveryRows.find(
            (row) => row.crawlRunId === run.id && row.channelId === channelId,
          );

          return !delivery || retryStatuses.includes(delivery.status);
        })
        .sort((left, right) => {
          return (
            (left.finishedAt?.getTime() ?? 0) - (right.finishedAt?.getTime() ?? 0) ||
            left.id.localeCompare(right.id)
          );
        })
        .slice(0, args.take);
    },
  );
  const publicDeliveryUpsert = vi.fn(
    async (args: {
      where: { crawlRunId_channelId: { crawlRunId: string; channelId: string } };
      create: Omit<TestDiscordPublicPriceReportDelivery, "id" | "createdAt" | "updatedAt">;
      update: Partial<TestDiscordPublicPriceReportDelivery>;
    }) => {
      const key = args.where.crawlRunId_channelId;
      const existing = publicDeliveryRows.find(
        (row) => row.crawlRunId === key.crawlRunId && row.channelId === key.channelId,
      );

      if (existing) {
        Object.assign(existing, args.update, {
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        });
        return existing;
      }

      const created: TestDiscordPublicPriceReportDelivery = {
        id: `public-delivery-${publicDeliveryRows.length + 1}`,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      publicDeliveryRows.push(created);

      return created;
    },
  );

  return {
    crawlRun: {
      findMany: crawlRunFindMany,
    },
    sourceCategory: {
      findMany: sourceCategoryFindMany,
    },
    product: {
      findFirst: productFindFirst,
    },
    priceSnapshot: {
      findMany,
    },
    discordNotificationDelivery: {
      create: deliveryCreate,
      findFirst: deliveryFindFirst,
    },
    discordPublicPriceReportDelivery: {
      findFirst: publicDeliveryFindFirst,
      upsert: publicDeliveryUpsert,
    },
    discordPublicPriceReportSetting: {
      deleteMany: publicSettingDeleteMany,
      findMany: publicSettingFindMany,
      findUnique: publicSettingFindUnique,
      update: publicSettingUpdate,
      upsert: publicSettingUpsert,
    },
    discordPriceReportSetting: {
      findFirst: settingFindFirst,
      findMany: settingFindMany,
      findUnique: settingFindUnique,
      update: settingUpdate,
      updateMany: settingUpdateMany,
      upsert: settingUpsert,
    },
    discordTargetPriceWatch: {
      findFirst: watchFindFirst,
      findMany: watchFindMany,
      updateMany: watchUpdateMany,
      upsert: watchUpsert,
    },
  } as unknown as DiscordBotClient & {
    crawlRun: {
      findMany: ReturnType<typeof vi.fn>;
    };
    sourceCategory: {
      findMany: ReturnType<typeof vi.fn>;
    };
    product: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    priceSnapshot: {
      findMany: ReturnType<typeof vi.fn>;
    };
    discordNotificationDelivery: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    discordPublicPriceReportDelivery: {
      findFirst: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    discordPublicPriceReportSetting: {
      deleteMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    discordPriceReportSetting: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    discordTargetPriceWatch: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
}

function toPrismaSnapshotWithProduct(snapshot: TestSnapshot) {
  return {
    id: snapshot.id,
    productId: snapshot.productId,
    price: snapshot.price,
    currency: snapshot.currency,
    capturedAt: snapshot.capturedAt,
    product: {
      id: snapshot.productId,
      name: snapshot.productName,
      vendorSlug: snapshot.vendorSlug,
      vendorName: snapshot.vendorName,
      sourceCategory: {
        igrp: snapshot.categoryIgrp,
        displayName: snapshot.categoryName,
      },
    },
  };
}

function toPrismaWatchProduct(snapshot: TestSnapshot) {
  return {
    id: snapshot.productId,
    name: snapshot.productName,
    currentPrice: {
      lastSeenAt: snapshot.capturedAt,
      priceSnapshot: {
        price: snapshot.price,
        currency: snapshot.currency,
        capturedAt: snapshot.capturedAt,
      },
    },
  };
}

function toPrismaWatchListRecord(watch: TestTargetPriceWatch, snapshots: TestSnapshot[]) {
  const latestSnapshot = snapshots
    .filter((snapshot) => snapshot.productId === watch.productId)
    .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0];

  return {
    id: watch.id,
    discordUserId: watch.discordUserId,
    productId: watch.productId,
    targetPrice: watch.targetPrice,
    currency: watch.currency,
    enabled: watch.enabled,
    lastNotifiedAt: watch.lastNotifiedAt,
    updatedAt: watch.updatedAt,
    product: latestSnapshot
      ? toPrismaWatchProduct(latestSnapshot)
      : {
          id: watch.productId,
          name: "Unknown product",
          currentPrice: null,
        },
  };
}

function matchesProductWhere(snapshot: TestSnapshot, where: TestProductWhere | undefined): boolean {
  if (!where) {
    return true;
  }

  const categoryIgrps = where.sourceCategory?.igrp?.in ?? [];

  if (categoryIgrps.length > 0 && !categoryIgrps.includes(snapshot.categoryIgrp)) {
    return false;
  }

  const nameContains = where.name?.contains;

  if (
    nameContains &&
    !snapshot.productName.toLocaleLowerCase().includes(nameContains.toLocaleLowerCase())
  ) {
    return false;
  }

  if (!(where.AND ?? []).every((condition) => matchesProductWhere(snapshot, condition))) {
    return false;
  }

  return !where.OR || where.OR.some((condition) => matchesProductWhere(snapshot, condition));
}

function compareCapturedAtAsc(left: TestSnapshot, right: TestSnapshot): number {
  return left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);
}

function comparePreviousSnapshotOrder(left: TestSnapshot, right: TestSnapshot): number {
  return (
    left.productId.localeCompare(right.productId) ||
    right.capturedAt.getTime() - left.capturedAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}
