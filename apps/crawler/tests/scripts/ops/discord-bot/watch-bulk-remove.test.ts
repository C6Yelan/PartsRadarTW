// apps/crawler/tests/scripts/ops/discord-bot/watch-bulk-remove.test.ts
// 驗證 /watch 管理面板的批次移除選單、確認流程與移除後刷新。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createBatchWatchManagerClient,
  createDiscordBotOptions,
  createWatchBulkRemoveSelectInteraction,
  createWatchButtonInteraction,
  findMessageComponentByPrefix,
  WATCH_DEFAULT_STATE,
  WATCH_ROW_ID,
  WATCH_SECOND_ROW_ID,
} from "./support";

describe("handleDiscordInteraction watch bulk removal", () => {
  it("opens a batch removal picker from the watch manager", async () => {
    const client = createBatchWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchButtonInteraction(`watch:bulk-remove:${WATCH_DEFAULT_STATE}`),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ type: 6 });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

    expect(requestBody).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "批次移除目標價追蹤",
          description: expect.stringContaining("選擇要移除的商品"),
        }),
      ],
      components: [
        {
          type: 1,
          components: [
            expect.objectContaining({
              custom_id: `watch:bulk-remove-select:${WATCH_DEFAULT_STATE}`,
              min_values: 1,
              max_values: 2,
              options: expect.arrayContaining([
                expect.objectContaining({ label: "RTX 5070 測試卡" }),
                expect.objectContaining({ label: "DDR5 6400 測試記憶體" }),
              ]),
            }),
          ],
        },
        {
          type: 1,
          components: [
            expect.objectContaining({
              custom_id: `watch:refresh:${WATCH_DEFAULT_STATE}`,
              label: "返回設定",
            }),
          ],
        },
      ],
    });
    expect(JSON.stringify(requestBody.embeds)).not.toContain(WATCH_ROW_ID);
    expect(JSON.stringify(requestBody.embeds)).not.toContain(WATCH_SECOND_ROW_ID);
  });

  it("batch removes selected target price watches and refreshes the manager", async () => {
    const client = createBatchWatchManagerClient();
    const selectFetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: selectFetchMock as typeof fetch,
      interaction: createWatchBulkRemoveSelectInteraction(
        [`watch:${WATCH_ROW_ID}`, `watch:${WATCH_SECOND_ROW_ID}`],
        0,
      ),
    });

    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    const confirmationBody = JSON.parse(String(selectFetchMock.mock.calls[1]?.[1]?.body));
    expect(confirmationBody.embeds[0]).toMatchObject({
      title: "確認批次移除目標價追蹤",
      description: expect.stringContaining("你即將移除 2 項目標價追蹤"),
    });
    expect(JSON.stringify(confirmationBody.embeds)).not.toContain(WATCH_ROW_ID);
    const confirmButton = findMessageComponentByPrefix(
      confirmationBody,
      "watch:bulk-remove-confirm:",
    );
    expect(confirmButton).toMatchObject({
      label: "確認移除",
    });

    const confirmFetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );
    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: confirmFetchMock as typeof fetch,
      interaction: createWatchButtonInteraction(confirmButton?.custom_id ?? ""),
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
    expect(client.discordTargetPriceWatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: WATCH_SECOND_ROW_ID,
        discordUserId: "111122223333444455",
        enabled: true,
      },
      data: {
        enabled: false,
      },
    });
    const requestBody = JSON.parse(String(confirmFetchMock.mock.calls[1]?.[1]?.body));
    expect(requestBody.embeds[0]).toMatchObject({
      title: "商品目標價追蹤",
      description: expect.stringContaining("已批次移除 2 項目標價追蹤"),
    });
    expect(requestBody.embeds[0].description).toContain("尚未追蹤商品");
  });
});
