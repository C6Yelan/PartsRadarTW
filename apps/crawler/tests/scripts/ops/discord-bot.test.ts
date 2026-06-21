// apps/crawler/tests/scripts/ops/discord-bot.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  CommandCooldowns,
  calculateScheduledPriceReportSleepMs,
  type DiscordBotClient,
  type DiscordBotMessage,
  type DiscordBotOptions,
  type DiscordInteraction,
  enableDailyPriceReport,
  handleDiscordInteraction,
  normalizeWatchProductReference,
  parseDiscordBotOptions,
  readNextScheduledPriceReportDueAt,
  registerDiscordBotCommands,
  sendDiscordDirectMessages,
  sendDiscordInteractionMessages,
  sendDueScheduledPriceReports,
  sendPriceReportNow,
} from "../../../src/scripts/ops/discord-bot";

const TOKEN = "test_bot_token";
const APPLICATION_ID = "123456789012345678";
const API_BASE_URL = "https://discord.test/api/v10";
const PUBLIC_BASE_URL = "https://partsradar.test/";
const WATCH_PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const WATCH_ROW_ID = "22222222-2222-4222-8222-222222222222";

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
  it("registers the global price-report and watch commands", async () => {
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
    ]);
    const registeredCommands = JSON.parse(String(globalRequestInit.body));
    expect(
      registeredCommands.find((command: { name: string }) => command.name === "watch"),
    ).not.toHaveProperty("options");
    expect(registeredCommands.map((command: { name: string }) => command.name)).toEqual([
      "price-report",
      "watch",
    ]);
    expect(String(globalRequestInit.body)).not.toContain('"enable"');
    expect(String(globalRequestInit.body)).not.toContain('"disable"');
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
          description: expect.stringContaining("目前尚未追蹤任何商品"),
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
          description: expect.stringContaining("記錄商品的理想入手價"),
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
    expect(requestBody.embeds[0].description).toContain("此設定頁面只有你看得到");
    expect(requestBody.embeds[0].description).toContain("**使用方式**");
    expect(requestBody.embeds[0].description).toContain("請從下方選單選擇");
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
    expect(requestBody.embeds[0].description).toContain("目前尚未追蹤任何商品");
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
          description: expect.stringContaining("目前尚未追蹤任何商品"),
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

  it("sends settings management buttons from the settings command", async () => {
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
        content: expect.stringContaining("尚未開啟每日價格提醒"),
        components: [
          {
            type: 1,
            components: [
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:open",
                label: "開啟/修改每日報告",
              }),
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:disable",
                label: "關閉每日報告",
              }),
            ],
          },
        ],
      },
    });
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

  it("opens a daily report settings modal from the settings button", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          window: "HOURS_12",
          maxItems: 12,
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
      interaction: createComponentInteraction("price-report:settings:open"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: "price-report:settings:modal",
        title: "每日價格報告設定",
      },
    });
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"12"');
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"21:30"');
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"12h","default":true');
  });

  it("enables daily report settings from the settings modal", async () => {
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
        window: "6h",
        maxItems: "8",
        time: "21:30",
      }),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          window: "HOURS_6",
          maxItems: 8,
          enabled: true,
        }),
        update: expect.objectContaining({
          window: "HOURS_6",
          maxItems: 8,
          enabled: true,
        }),
      }),
    );
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)).toContain(
      "已開啟每日價格提醒",
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
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)).toContain(
      "已關閉每日價格提醒",
    );
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

function createSettingsModalSubmitInteraction({
  window = "24h",
  maxItems = "50",
  time = "09:00",
}: {
  window?: string;
  maxItems?: string;
  time?: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: "price-report:settings:modal",
      components: [
        {
          type: 18,
          component: {
            type: 3,
            custom_id: "price-report:settings:window",
            values: [window],
          },
        },
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
  enabled: boolean;
  nextSendAt: Date | null;
  lastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestTargetPriceWatch {
  id: string;
  discordUserId: string;
  productId: string;
  targetPrice: number;
  currency: string;
  enabled: boolean;
  lastNotifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  enabled = true,
}: {
  id: string;
  discordUserId: string;
  nextSendAt: Date | null;
  interval?: TestPriceReportSetting["interval"];
  window?: TestPriceReportSetting["window"];
  maxItems?: number;
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
}: {
  id: string;
  discordUserId: string;
  productId: string;
  targetPrice: number;
  currency?: string;
  enabled?: boolean;
  lastNotifiedAt?: Date | null;
}): TestTargetPriceWatch {
  return {
    id,
    discordUserId,
    productId,
    targetPrice,
    currency,
    enabled,
    lastNotifiedAt,
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt: new Date("2026-06-07T00:00:00.000Z"),
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
): DiscordBotClient & {
  product: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  priceSnapshot: {
    findMany: ReturnType<typeof vi.fn>;
  };
  discordNotificationDelivery: {
    create: ReturnType<typeof vi.fn>;
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
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;

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
            snapshot.capturedAt.getTime() <= capturedAtFilter.lte.getTime(),
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
  const watchFindMany = vi.fn(
    async (args: {
      where: { discordUserId?: string; enabled?: boolean };
      skip?: number;
      take?: number;
    }) => {
      const rows = watchRows
        .filter((watch) => {
          if (
            args.where.discordUserId !== undefined &&
            watch.discordUserId !== args.where.discordUserId
          ) {
            return false;
          }

          return args.where.enabled === undefined || watch.enabled === args.where.enabled;
        })
        .sort((left, right) => {
          return (
            right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id)
          );
        })
        .map(toWatchRecord);
      const start = args.skip ?? 0;

      return typeof args.take === "number"
        ? rows.slice(start, start + args.take)
        : rows.slice(start);
    },
  );
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
    async (args: {
      where: { id?: string; discordUserId?: string; productId?: string; enabled?: boolean };
      data: Partial<TestTargetPriceWatch>;
    }) => {
      let count = 0;

      for (const watch of watchRows) {
        if (args.where.id !== undefined && watch.id !== args.where.id) {
          continue;
        }

        if (
          args.where.discordUserId !== undefined &&
          watch.discordUserId !== args.where.discordUserId
        ) {
          continue;
        }

        if (args.where.productId !== undefined && watch.productId !== args.where.productId) {
          continue;
        }

        if (args.where.enabled !== undefined && watch.enabled !== args.where.enabled) {
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
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      watchRows.push(created);

      return created;
    },
  );

  return {
    product: {
      findFirst: productFindFirst,
    },
    priceSnapshot: {
      findMany,
    },
    discordNotificationDelivery: {
      create: vi.fn(async () => ({ id: "delivery-1" })),
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
    product: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    priceSnapshot: {
      findMany: ReturnType<typeof vi.fn>;
    };
    discordNotificationDelivery: {
      create: ReturnType<typeof vi.fn>;
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
