// apps/crawler/tests/scripts/ops/discord-bot/watch/watch-manager-navigation.test.ts
// 驗證 /watch 管理清單固定排序、精簡控制項、分頁與舊 page suffix 相容性。

import { describe, expect, it, vi } from "vitest";
import { MAX_TARGET_PRICE_WATCHES_PER_USER } from "../../../../../src/scripts/ops/discord-bot/constants";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createWatchButtonInteraction,
  createWatchOpenInteraction,
  findMessageComponent,
  snapshot,
  targetPriceWatch,
} from "../support";

describe("handleDiscordInteraction watch manager navigation", () => {
  it("uses a fixed recent-first order and paginates at the Discord select limit", async () => {
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
    const client = createDiscordBotClient({
      snapshots,
      watches,
    });
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
    expect(findMessageComponent(firstPage, "watch:page:1")).toEqual(
      expect.objectContaining({ disabled: false }),
    );
    expect(firstPage.embeds[0].description).toContain("最近更新的排在前面");
    expect(JSON.stringify(firstPage)).not.toContain("watch:filter:");
    expect(JSON.stringify(firstPage)).not.toContain("watch:sort:");
    expect(JSON.stringify(firstPage)).not.toContain("watch:bulk-remove:");
    expect(client.discordTargetPriceWatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: MAX_TARGET_PRICE_WATCHES_PER_USER,
      }),
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
      custom_id: "watch:select:1",
      options: expect.any(Array),
    });
    expect(secondPage.components[0].components[0].options).toHaveLength(1);
    expect(findMessageComponent(secondPage, "watch:page:0")).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });
});
