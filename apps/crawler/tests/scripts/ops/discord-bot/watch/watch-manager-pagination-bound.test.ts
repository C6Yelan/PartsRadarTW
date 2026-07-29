// apps/crawler/tests/scripts/ops/discord-bot/watch/watch-manager-pagination-bound.test.ts
// 驗證 watch manager 對任意頁碼只執行一次 bounded list read，並回到最後合法頁。

import { describe, expect, it, vi } from "vitest";
import {
  parseTargetPriceWatchComponentInteraction,
  parseTargetPriceWatchModalSubmit,
} from "../../../../../src/scripts/ops/discord-bot/commands";
import { MAX_TARGET_PRICE_WATCHES_PER_USER } from "../../../../../src/scripts/ops/discord-bot/constants";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/interactions";
import { readTargetPriceWatchManagerPage } from "../../../../../src/scripts/ops/discord-bot/interactions/watch-manager";
import type { DiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/types";
import {
  WATCH_MANAGER_MAX_PAGE,
  WATCH_MANAGER_PAGE_SIZE,
} from "../../../../../src/scripts/ops/discord-bot/watch/list-limits";
import { createDiscordBotClient } from "../support/client";
import { snapshot, targetPriceWatch } from "../support/data-factories";
import { createWatchButtonInteraction } from "../support/interactions-watch";
import { createDiscordBotOptions } from "../support/options";

const TEST_USER_ID = "test-user";
const INTERACTION_USER_ID = "111122223333444455";
const TEST_WATCH_ID = "20000000-0000-4000-8000-000000000001";

describe("watch manager page parsing", () => {
  it.each([
    { name: "first page", value: "0", expected: 0 },
    {
      name: "last possible page",
      value: String(WATCH_MANAGER_MAX_PAGE),
      expected: WATCH_MANAGER_MAX_PAGE,
    },
    {
      name: "out-of-range safe integer",
      value: String(WATCH_MANAGER_MAX_PAGE + 1),
      expected: WATCH_MANAGER_MAX_PAGE,
    },
    {
      name: "maximum safe integer",
      value: String(Number.MAX_SAFE_INTEGER),
      expected: WATCH_MANAGER_MAX_PAGE,
    },
    {
      name: "integer above the safe range",
      value: String(Number.MAX_SAFE_INTEGER + 1),
      expected: WATCH_MANAGER_MAX_PAGE,
    },
    {
      name: "one thousand digits",
      value: "9".repeat(1_000),
      expected: WATCH_MANAGER_MAX_PAGE,
    },
    { name: "negative input", value: "-1", expected: 0 },
    { name: "non-numeric input", value: "not-a-page", expected: 0 },
    { name: "leading zeroes", value: "0000000000", expected: 0 },
    {
      name: "legacy filter and sort suffix",
      value: `${WATCH_MANAGER_MAX_PAGE}:all:recent`,
      expected: WATCH_MANAGER_MAX_PAGE,
    },
  ])("normalizes $name without exposing an unbounded page", ({ value, expected }) => {
    expect(parseWatchComponent(`watch:page:${value}`)).toMatchObject({
      action: "page",
      page: expected,
    });
  });

  it.each([
    {
      name: "select",
      customId: `watch:select:${Number.MAX_SAFE_INTEGER}`,
      values: [`watch:${TEST_WATCH_ID}`],
    },
    {
      name: "edit",
      customId: `watch:edit:${TEST_WATCH_ID}:17500:${Number.MAX_SAFE_INTEGER}`,
    },
    {
      name: "remove",
      customId: `watch:remove:${TEST_WATCH_ID}:${Number.MAX_SAFE_INTEGER}`,
    },
    {
      name: "confirm remove",
      customId: `watch:remove-confirm:${TEST_WATCH_ID}:${Number.MAX_SAFE_INTEGER}`,
    },
    {
      name: "cancel remove",
      customId: `watch:remove-cancel:${TEST_WATCH_ID}:${Number.MAX_SAFE_INTEGER}`,
    },
    {
      name: "refresh",
      customId: `watch:refresh:${Number.MAX_SAFE_INTEGER}`,
    },
  ])("keeps the $name custom id compatible while bounding its page", ({ customId, values }) => {
    expect(parseWatchComponent(customId, values)).toMatchObject({
      page: WATCH_MANAGER_MAX_PAGE,
    });
  });

  it("bounds the edit modal page suffix before returning it to the manager", () => {
    expect(
      parseTargetPriceWatchModalSubmit({
        id: "interaction",
        token: "interaction-token",
        type: 5,
        data: {
          custom_id: `watch:edit-modal:${TEST_WATCH_ID}:${Number.MAX_SAFE_INTEGER}`,
          components: [
            {
              type: 18,
              component: {
                type: 4,
                custom_id: "watch:target-price",
                value: "17500",
              },
            },
          ],
        },
      }),
    ).toMatchObject({
      action: "edit",
      page: WATCH_MANAGER_MAX_PAGE,
      targetPriceInputValid: true,
    });
  });
});

describe("readTargetPriceWatchManagerPage", () => {
  it.each([
    0, 1, 25, 26, 49, 50,
  ])("clamps an oversized request after one bounded read when the user has %i watches", async (watchCount) => {
    const client = createWatchClient(watchCount, TEST_USER_ID);

    const result = await readTargetPriceWatchManagerPage({
      client,
      discordUserId: TEST_USER_ID,
      page: Number.MAX_SAFE_INTEGER,
    });
    const expectedPage =
      watchCount === 0
        ? 0
        : Math.min(WATCH_MANAGER_MAX_PAGE, Math.floor((watchCount - 1) / WATCH_MANAGER_PAGE_SIZE));
    const expectedPageSize = expectedPage === 0 ? watchCount : watchCount - WATCH_MANAGER_PAGE_SIZE;

    expect(result).toMatchObject({
      page: expectedPage,
      totalCount: watchCount,
      hasPreviousPage: expectedPage > 0,
      hasNextPage: false,
    });
    expect(result.watches).toHaveLength(expectedPageSize);
    expect(client.discordTargetPriceWatch.findMany).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: {
          discordUserId: TEST_USER_ID,
          enabled: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: MAX_TARGET_PRICE_WATCHES_PER_USER,
      }),
    );
    expect(client.discordTargetPriceWatch.findMany.mock.calls[0]?.[0]).not.toHaveProperty("skip");
  });

  it.each([
    { name: "page zero", page: 0, expected: 0 },
    {
      name: "last possible page",
      page: WATCH_MANAGER_MAX_PAGE,
      expected: WATCH_MANAGER_MAX_PAGE,
    },
    {
      name: "page above the limit",
      page: WATCH_MANAGER_MAX_PAGE + 1,
      expected: WATCH_MANAGER_MAX_PAGE,
    },
    {
      name: "maximum safe integer",
      page: Number.MAX_SAFE_INTEGER,
      expected: WATCH_MANAGER_MAX_PAGE,
    },
    { name: "negative page", page: -1, expected: 0 },
    { name: "not-a-number", page: Number.NaN, expected: 0 },
    { name: "infinity", page: Number.POSITIVE_INFINITY, expected: 0 },
  ])("normalizes $name with a fixed list call count", async ({ page, expected }) => {
    const client = createWatchClient(MAX_TARGET_PRICE_WATCHES_PER_USER, TEST_USER_ID);

    const result = await readTargetPriceWatchManagerPage({
      client,
      discordUserId: TEST_USER_ID,
      page,
    });

    expect(result.page).toBe(expected);
    expect(result.watches).toHaveLength(WATCH_MANAGER_PAGE_SIZE);
    expect(client.discordTargetPriceWatch.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("watch manager oversized interaction behavior", () => {
  it("returns one bounded last-page response for a thousand-digit custom id", async () => {
    const oversizedPage = "9".repeat(1_000);
    const client = createWatchClient(MAX_TARGET_PRICE_WATCHES_PER_USER, INTERACTION_USER_ID);
    const fetchMock = createSuccessfulFetchMock();

    await handleDiscordInteraction({
      client,
      interaction: createWatchButtonInteraction(`watch:page:${oversizedPage}`),
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(client.discordTargetPriceWatch.findMany).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const responseBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

    expect(responseBody.embeds[0].footer.text).toContain(`第 ${WATCH_MANAGER_MAX_PAGE + 1} 頁`);
    expect(JSON.stringify(responseBody)).not.toContain(oversizedPage);
  });

  it("returns to the previous legal page after removing the last watch on page two", async () => {
    const client = createWatchClient(WATCH_MANAGER_PAGE_SIZE + 1, INTERACTION_USER_ID);
    const fetchMock = createSuccessfulFetchMock();
    const lastWatchId = createWatchId(WATCH_MANAGER_PAGE_SIZE);

    await handleDiscordInteraction({
      client,
      interaction: createWatchButtonInteraction(`watch:remove-confirm:${lastWatchId}:1`),
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(client.discordTargetPriceWatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: lastWatchId,
          discordUserId: INTERACTION_USER_ID,
          enabled: true,
        },
      }),
    );
    expect(client.discordTargetPriceWatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: lastWatchId,
          discordUserId: INTERACTION_USER_ID,
          enabled: true,
        },
      }),
    );
    expect(client.discordTargetPriceWatch.findMany).toHaveBeenCalledTimes(1);
    const responseBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

    expect(responseBody.embeds[0].footer.text).toContain("第 1 頁");
    expect(responseBody.embeds[0].description).toContain("已移除目標價追蹤");
  });
});

function parseWatchComponent(customId: string, values?: string[]) {
  return parseTargetPriceWatchComponentInteraction({
    id: "interaction",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: customId,
      component_type: values ? 3 : 2,
      values,
    },
  } satisfies DiscordInteraction);
}

function createWatchClient(watchCount: number, discordUserId: string) {
  const snapshots = Array.from({ length: watchCount }, (_, index) =>
    snapshot({
      id: `snapshot-watch-${index + 1}`,
      productId: createProductId(index),
      productName: `測試商品 ${index + 1}`,
      crawlRunId: "test-run",
      price: 20_000 + index,
      capturedAt: "2026-06-07T03:00:00.000Z",
    }),
  );
  const watches = snapshots.map((item, index) =>
    targetPriceWatch({
      id: createWatchId(index),
      discordUserId,
      productId: item.productId,
      targetPrice: 17_500 + index,
    }),
  );

  return createDiscordBotClient({ snapshots, watches });
}

function createProductId(index: number): string {
  return `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function createWatchId(index: number): string {
  return `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function createSuccessfulFetchMock() {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
  );
}
