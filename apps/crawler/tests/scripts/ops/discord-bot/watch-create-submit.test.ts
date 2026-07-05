// apps/crawler/tests/scripts/ops/discord-bot/watch-create-submit.test.ts
import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import { MAX_TARGET_PRICE_WATCHES_PER_USER } from "../../../../src/scripts/ops/discord-bot/constants";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createTargetPriceWatchModalSubmitInteraction,
  snapshot,
  targetPriceWatch,
  WATCH_PRODUCT_ID,
  WATCH_ROW_ID,
} from "./support";

describe("handleDiscordInteraction watch create submit", () => {
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
      interaction: createTargetPriceWatchModalSubmitInteraction({
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
        notificationCursorAt: expect.any(Date),
      },
      update: {
        targetPrice: 17_500,
        currency: "TWD",
        enabled: true,
        lastNotifiedAt: null,
        notificationClaimedAt: null,
        notificationCursorAt: expect.any(Date),
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

  it("rejects a new watch when the user reaches the watch limit", async () => {
    const watches = Array.from({ length: MAX_TARGET_PRICE_WATCHES_PER_USER }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");

      return targetPriceWatch({
        id: `30000000-0000-4000-8000-${suffix}`,
        discordUserId: "111122223333444455",
        productId: `40000000-0000-4000-8000-${suffix}`,
        targetPrice: 17_500,
      });
    });
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "snapshot-watch-new",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 18_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [],
      watches,
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createTargetPriceWatchModalSubmitInteraction({
        productInput: `https://partsradar.test/products/${WATCH_PRODUCT_ID}`,
        targetPrice: "17500",
      }),
    });

    const responseBody = String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body);

    expect(responseBody).toContain(`最多 ${MAX_TARGET_PRICE_WATCHES_PER_USER} 個商品追蹤`);
    expect(responseBody).toContain("請先在 /watch 移除不需要的追蹤");
    expect(client.discordTargetPriceWatch.upsert).not.toHaveBeenCalled();
  });

  it("updates an existing watch even when the user reaches the watch limit", async () => {
    const otherWatches = Array.from(
      { length: MAX_TARGET_PRICE_WATCHES_PER_USER - 1 },
      (_, index) => {
        const suffix = String(index + 1).padStart(12, "0");

        return targetPriceWatch({
          id: `50000000-0000-4000-8000-${suffix}`,
          discordUserId: "111122223333444455",
          productId: `60000000-0000-4000-8000-${suffix}`,
          targetPrice: 17_500,
        });
      },
    );
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "snapshot-watch-existing",
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
        ...otherWatches,
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
      interaction: createTargetPriceWatchModalSubmitInteraction({
        productInput: `https://partsradar.test/products/${WATCH_PRODUCT_ID}`,
        targetPrice: "16500",
      }),
    });

    expect(client.discordTargetPriceWatch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          discordUserId_productId: {
            discordUserId: "111122223333444455",
            productId: WATCH_PRODUCT_ID,
          },
        },
        update: expect.objectContaining({
          targetPrice: 16_500,
        }),
      }),
    );
  });
});
