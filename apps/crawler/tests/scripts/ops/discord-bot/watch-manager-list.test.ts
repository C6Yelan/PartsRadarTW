// apps/crawler/tests/scripts/ops/discord-bot/watch-manager-list.test.ts
// 驗證 /watch 管理清單、選取狀態、active watch 顯示與通知失敗訊息轉譯。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createWatchManagerClient,
  createWatchOpenInteraction,
  createWatchSelectInteraction,
  notificationDelivery,
  readEmbedFieldValue,
  snapshot,
  TEST_SOURCE_CATEGORIES,
  targetPriceWatch,
  WATCH_DEFAULT_STATE,
  WATCH_PRODUCT_ID,
  WATCH_ROW_ID,
} from "./support";

describe("handleDiscordInteraction watch manager list", () => {
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
              custom_id: `watch:select:${WATCH_DEFAULT_STATE}`,
              options: [expect.objectContaining({ value: `watch:${WATCH_ROW_ID}`, default: true })],
            }),
          ],
        }),
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              custom_id: `watch:edit:${WATCH_ROW_ID}:17500:${WATCH_DEFAULT_STATE}`,
              disabled: false,
            }),
            expect.objectContaining({
              custom_id: `watch:remove:${WATCH_ROW_ID}:${WATCH_DEFAULT_STATE}`,
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
          errorCategory: "PERMISSIONS",
          httpStatus: 403,
          providerErrorCode: 50013,
          errorMessage: "legacy raw Missing Permissions private-token",
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

    expect(latestNotification).toContain("我目前缺少完成這次 Discord 發送所需的權限");
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
        errorCategory: true,
        httpStatus: true,
        providerErrorCode: true,
      }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
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
              custom_id: `watch:select:${WATCH_DEFAULT_STATE}`,
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
});
