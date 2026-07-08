// apps/crawler/tests/scripts/ops/discord-bot/watch-edit-remove.test.ts
// 驗證 /watch 單筆追蹤的編輯、移除確認/取消、移除後刷新與錯誤輸入提示。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createWatchButtonInteraction,
  createWatchEditModalSubmitInteraction,
  createWatchManagerClient,
  findMessageComponent,
  WATCH_DEFAULT_STATE,
  WATCH_ROW_ID,
} from "./support";

describe("handleDiscordInteraction watch edit and remove", () => {
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
      interaction: createWatchButtonInteraction(
        `watch:edit:${WATCH_ROW_ID}:17500:${WATCH_DEFAULT_STATE}`,
      ),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: `watch:edit-modal:${WATCH_ROW_ID}:${WATCH_DEFAULT_STATE}`,
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
        notificationCursorAt: expect.any(Date),
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
      interaction: createWatchButtonInteraction(
        `watch:remove:${WATCH_ROW_ID}:${WATCH_DEFAULT_STATE}`,
      ),
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
              custom_id: `watch:remove-confirm:${WATCH_ROW_ID}:${WATCH_DEFAULT_STATE}`,
              label: "確認移除",
            }),
            expect.objectContaining({
              custom_id: `watch:remove-cancel:${WATCH_ROW_ID}:${WATCH_DEFAULT_STATE}`,
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
      interaction: createWatchButtonInteraction(
        `watch:remove-cancel:${WATCH_ROW_ID}:${WATCH_DEFAULT_STATE}`,
      ),
    });

    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(requestBody.components[0].components[0].options[0]).toMatchObject({
      value: `watch:${WATCH_ROW_ID}`,
      default: true,
    });
    expect(
      findMessageComponent(requestBody, `watch:edit:${WATCH_ROW_ID}:17500:${WATCH_DEFAULT_STATE}`),
    ).toBeDefined();
    expect(
      findMessageComponent(requestBody, `watch:remove:${WATCH_ROW_ID}:${WATCH_DEFAULT_STATE}`),
    ).toBeDefined();
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
      interaction: createWatchButtonInteraction(
        `watch:remove-confirm:${WATCH_ROW_ID}:${WATCH_DEFAULT_STATE}`,
      ),
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
});
