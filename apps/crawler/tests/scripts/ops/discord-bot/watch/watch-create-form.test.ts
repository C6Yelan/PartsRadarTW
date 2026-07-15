// apps/crawler/tests/scripts/ops/discord-bot/watch/watch-create-form.test.ts
// 驗證 /watch 新增追蹤表單、空清單狀態、Discord 錯誤透出與欄位驗證提示。

import { describe, expect, it, vi } from "vitest";
import { MAX_TARGET_PRICE_WATCHES_PER_USER } from "../../../../../src/scripts/ops/discord-bot/constants";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createTargetPriceWatchModalSubmitInteraction,
  createWatchButtonInteraction,
  createWatchOpenInteraction,
} from "../support";

describe("handleDiscordInteraction watch create form", () => {
  it("opens an empty target price watch manager from the watch command", async () => {
    const client = createDiscordBotClient();
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
          title: "目標價提醒",
          description: expect.stringContaining("尚未設定商品提醒"),
        }),
      ],
      components: [
        {
          type: 1,
          components: [
            expect.objectContaining({ custom_id: "watch:add", label: "新增提醒" }),
            expect.objectContaining({
              custom_id: "watch:edit:none:0:0",
              disabled: true,
            }),
            expect.objectContaining({
              custom_id: "watch:remove:none:0",
              disabled: true,
            }),
            expect.objectContaining({ custom_id: "watch:refresh:0" }),
          ],
        },
      ],
    });
    expect(client.discordTargetPriceWatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: MAX_TARGET_PRICE_WATCHES_PER_USER,
      }),
    );
  });

  it("opens the create form from the watch manager", async () => {
    const client = createDiscordBotClient();
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
            description: expect.stringContaining("商品頁網址或網址最後那串ID"),
            component: expect.objectContaining({ custom_id: "watch:product" }),
          }),
          expect.objectContaining({
            label: "理想入手價格（新台幣）",
            description: expect.stringContaining("不要加NT$"),
            component: expect.objectContaining({ custom_id: "watch:target-price" }),
          }),
        ],
      },
    });
    expect(requestBody.data.components[0].component).not.toHaveProperty("value");
    expect(requestBody.data.components[1].component).not.toHaveProperty("value");
  });

  it("surfaces Discord API validation errors when the watch manager response is rejected", async () => {
    const client = createDiscordBotClient();
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
    ).rejects.toThrow(
      "Discord deferred interaction response failed: failed category=PROVIDER httpStatus=400 providerErrorCode=50035",
    );
  });

  it("rejects invalid watch modal values with field guidance", async () => {
    const client = createDiscordBotClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createTargetPriceWatchModalSubmitInteraction({
        productInput: "",
        targetPrice: "NT$17,500",
      }),
    });

    expect(client.discordTargetPriceWatch.upsert).not.toHaveBeenCalled();
    const responseBody = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body);
    expect(responseBody).toContain("商品頁網址或網址最後那串ID");
    expect(responseBody).toContain("目標價格請輸入");
    expect(responseBody).toContain("範圍內純數字");
    expect(responseBody).toContain("不要加NT$");
  });

  it.each([
    "17 500",
    "17,500",
    "17500.0",
    "-17500",
    "一萬七千五",
  ])("rejects mixed target-price input %s", async (targetPrice) => {
    const client = createDiscordBotClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createTargetPriceWatchModalSubmitInteraction({
        productInput: "https://partsradar.test/products/11111111-1111-4111-8111-111111111111",
        targetPrice,
      }),
    });

    expect(client.discordTargetPriceWatch.upsert).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("範圍內純數字");
  });
});
