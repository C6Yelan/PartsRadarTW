// apps/crawler/tests/scripts/ops/discord-bot/price-report-settings-delivery.test.ts
// 驗證個人價格報告設定面板會顯示最近 delivery 狀態，並避免外露 Discord 原始錯誤。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  API_BASE_URL,
  APPLICATION_ID,
  createDiscordBotClient,
  createDiscordBotOptions,
  createInteraction,
  notificationDelivery,
  priceReportSetting,
  readEmbedFieldValue,
  readResponseEmbed,
  TEST_SOURCE_CATEGORIES,
} from "./support";

describe("handleDiscordInteraction price report settings delivery", () => {
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
          errorCategory: "DM_UNAVAILABLE",
          httpStatus: 403,
          providerErrorCode: 50007,
          errorMessage:
            "legacy raw message Authorization: Bot private-token errors={private-payload}",
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
    expect(deliveryStatus).not.toContain("private-token");
    expect(deliveryStatus).not.toContain("private-payload");
  });

  it("does not classify or display legacy error_message content", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-legacy",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
        }),
      ],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [
        notificationDelivery({
          id: "delivery-legacy-failed",
          discordUserId: "111122223333444455",
          kind: "SCHEDULED_PRICE_REPORT",
          status: "FAILED",
          errorCategory: null,
          errorMessage:
            "Discord API returned HTTP 403. code=50007 DISCORD_BOT_TOKEN=legacy-private-token",
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

    expect(deliveryStatus).toContain("Discord 暫時無法完成通知");
    expect(deliveryStatus).not.toContain("50007");
    expect(deliveryStatus).not.toContain("legacy-private-token");
    expect(deliveryStatus).not.toContain("無法傳送私訊");
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
});
