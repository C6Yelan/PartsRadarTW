// apps/crawler/tests/scripts/ops/discord-bot/watch-manager-navigation.test.ts
import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createSortableWatchManagerClient,
  createWatchButtonInteraction,
  createWatchOpenInteraction,
  createWatchStateSelectInteraction,
  findMessageComponent,
  snapshot,
  targetPriceWatch,
  WATCH_DEFAULT_STATE,
  WATCH_SECOND_ROW_ID,
} from "./support";

describe("handleDiscordInteraction watch manager navigation", () => {
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
      custom_id: `watch:select:${WATCH_DEFAULT_STATE}`,
      options: expect.any(Array),
    });
    expect(firstPage.components[0].components[0].options).toHaveLength(25);
    expect(findMessageComponent(firstPage, "watch:page:1:all:recent")).toEqual(
      expect.objectContaining({ disabled: false }),
    );

    const secondPageFetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );
    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: secondPageFetch as typeof fetch,
      interaction: createWatchButtonInteraction("watch:page:1:all:recent"),
    });

    const secondPage = JSON.parse(String(secondPageFetch.mock.calls[1]?.[1]?.body));
    expect(secondPage.components[0].components[0]).toMatchObject({
      custom_id: "watch:select:1:all:recent",
      options: expect.any(Array),
    });
    expect(secondPage.components[0].components[0].options).toHaveLength(1);
    expect(findMessageComponent(secondPage, `watch:page:${WATCH_DEFAULT_STATE}`)).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it("filters target price watches by reached status", async () => {
    const client = createSortableWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchStateSelectInteraction(
        `watch:filter:${WATCH_DEFAULT_STATE}`,
        "reached",
      ),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const productSelect = requestBody.components[0].components[0];

    expect(requestBody.embeds[0].description).toContain("顯示：已達標");
    expect(productSelect).toMatchObject({
      custom_id: "watch:select:0:reached:recent",
      options: [
        expect.objectContaining({
          label: "DDR5 6400 測試記憶體",
          value: `watch:${WATCH_SECOND_ROW_ID}`,
        }),
      ],
    });
    expect(findMessageComponent(requestBody, "watch:filter:0:reached:recent")).toBeDefined();
  });

  it("sorts target price watches by current price", async () => {
    const client = createSortableWatchManagerClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchStateSelectInteraction(
        `watch:sort:${WATCH_DEFAULT_STATE}`,
        "current",
      ),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const productSelect = requestBody.components[0].components[0];

    expect(requestBody.embeds[0].description).toContain("排序：目前價格低到高");
    expect(productSelect.custom_id).toBe("watch:select:0:all:current");
    expect(productSelect.options.map((option: { label: string }) => option.label)).toEqual([
      "DDR5 6400 測試記憶體",
      "RTX 5070 測試卡",
    ]);
  });
});
