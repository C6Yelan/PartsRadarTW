// apps/crawler/tests/scripts/ops/discord-bot/public-price-report/public-price-report-settings-panel.test.ts
// 驗證公開報告設定面板、頻道設定與 bot 權限不足時的回應。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/interactions";
import { createDiscordBotClient } from "../support/client";
import { publicPriceReportDelivery, publicPriceReportSetting } from "../support/data-factories";
import {
  createPublicReportButtonInteraction,
  createPublicReportInteraction,
} from "../support/interactions-public-report";
import { readEmbedFieldValue, readResponseEmbed } from "../support/message-assertions";
import { createDiscordBotOptions } from "../support/options";

describe("public price report settings panel", () => {
  it("shows the public report settings panel from the public-report settings command", async () => {
    const client = createDiscordBotClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "settings" }),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(requestBody).toMatchObject({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          expect.objectContaining({
            title: "公開價格報告設定",
            description: expect.stringContaining("降價、漲價或新增商品"),
            fields: expect.arrayContaining([
              expect.objectContaining({ name: "狀態", value: "尚未設定" }),
              expect.objectContaining({ name: "發送頻道", value: "尚未設定" }),
              expect.objectContaining({
                name: "你目前所在的頻道",
                value: "<#999988887777666655>",
              }),
            ]),
          }),
        ],
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                custom_id: "public-report:set-channel",
                label: "設為此頻道",
              }),
              expect.objectContaining({
                custom_id: "public-report:preview",
                disabled: true,
              }),
            ]),
          }),
        ]),
      },
    });
    const settingsEmbed = readResponseEmbed(requestBody.data);

    expect(settingsEmbed.description).toBe(
      "設定公開報告要發送的頻道與內容。有符合條件的降價、漲價或新增商品時，bot 會自動發送。",
    );
    expect(readEmbedFieldValue(settingsEmbed, "發送說明")).toBe(
      "自動發送失敗時，bot 會稍後再試；「發送測試」只會傳送一次。",
    );
    expect(JSON.stringify(settingsEmbed)).not.toMatch(
      /排程爬蟲|後續輪次|先前輪次|排程進度|cursor|限流/,
    );
    expect(JSON.stringify(requestBody.data)).not.toContain("最多列出");
    expect(JSON.stringify(requestBody.data)).not.toContain("public-report:limit");
  });

  it("opens five public keyword groups and prefills the canonical stored value", async () => {
    const client = createDiscordBotClient({
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "public-setting-1",
          maxItems: 12,
          productKeyword: "RTX 5090, DDR5",
        }),
      ],
    });
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportButtonInteraction("public-report:keyword"),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: "public-report:keyword-modal",
        title: "商品名稱關鍵字",
        components: expect.arrayContaining([
          expect.objectContaining({
            component: expect.objectContaining({
              custom_id: "public-report:keyword-input",
              value: "RTX 5090",
            }),
          }),
          expect.objectContaining({
            component: expect.objectContaining({
              custom_id: "public-report:keyword-input:2",
              value: "DDR5",
            }),
          }),
        ]),
      },
    });
    expect(requestBody.data.components).toHaveLength(5);
    expect(requestBody.data.components[0]).toMatchObject({
      label: "其中一組關鍵字 1",
      description: "同一欄的詞要全部出現在商品名稱中；不同欄只要符合其中一組。全部留空代表不限。",
      component: { placeholder: "例：RTX 5090" },
    });
    expect(client.discordPublicPriceReportSetting.findUnique).toHaveBeenCalledWith({
      where: { discordGuildId: "guild-1" },
      select: expect.not.objectContaining({
        maxItems: true,
        createdByDiscordUserId: true,
        updatedByDiscordUserId: true,
      }),
    });
  });

  it.each([
    ["SENT", 23, "06/07 10:00，已發送 23 筆商品。"],
    ["SKIPPED", 0, "06/07 10:00，當時沒有符合條件的商品。"],
  ] as const)("shows a human-readable %s delivery result", async (status, itemCount, expected) => {
    const client = createDiscordBotClient({
      publicPriceReportDeliveries: [
        publicPriceReportDelivery({
          id: `delivery-${status.toLowerCase()}`,
          crawlRunId: `crawl-run-${status.toLowerCase()}`,
          channelId: "999988887777666655",
          status,
          itemCount,
          deliveredAt: new Date("2026-06-07T02:00:00.000Z"),
          updatedAt: new Date("2026-06-07T02:00:00.000Z"),
        }),
      ],
      publicPriceReportSettings: [publicPriceReportSetting({ id: "public-setting-1" })],
    });
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "settings" }),
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(readEmbedFieldValue(readResponseEmbed(body.data), "最近一次發送")).toBe(expected);
  });

  it("shows the most recently retried public delivery by updated timestamp", async () => {
    const client = createDiscordBotClient({
      publicPriceReportDeliveries: [
        publicPriceReportDelivery({
          id: "delivery-newer-row",
          crawlRunId: "crawl-run-newer",
          channelId: "999988887777666655",
          status: "SENT",
          itemCount: 3,
          messageCount: 1,
          deliveredAt: new Date("2026-06-07T01:00:00.000Z"),
          createdAt: new Date("2026-06-07T01:00:00.000Z"),
          updatedAt: new Date("2026-06-07T01:00:00.000Z"),
        }),
        publicPriceReportDelivery({
          id: "delivery-retried",
          crawlRunId: "crawl-run-old",
          channelId: "999988887777666655",
          status: "FAILED",
          errorCategory: "TRANSPORT",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T02:00:00.000Z"),
        }),
      ],
      publicPriceReportSettings: [publicPriceReportSetting({ id: "public-setting-1" })],
    });
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "settings" }),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const latestDelivery = readEmbedFieldValue(readResponseEmbed(requestBody.data), "最近一次發送");

    expect(latestDelivery).toBe("06/07 10:00，發送失敗，bot 會稍後再試。");
    expect(client.discordPublicPriceReportDelivery.findFirst).toHaveBeenCalledWith({
      where: {
        channelId: "999988887777666655",
      },
      select: expect.objectContaining({
        status: true,
        updatedAt: true,
      }),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
  });

  it("shows an auto-disabled setting without promising another retry", async () => {
    const client = createDiscordBotClient({
      publicPriceReportDeliveries: [
        publicPriceReportDelivery({
          id: "delivery-disabled",
          crawlRunId: "crawl-run-disabled",
          channelId: "999988887777666655",
          status: "FAILED",
          providerErrorCode: 10004,
          updatedAt: new Date("2026-06-07T02:00:00.000Z"),
        }),
      ],
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "public-setting-disabled",
          enabled: false,
          accessStatus: "DISABLED_BOT_REMOVED",
          disabledAt: new Date("2026-06-07T02:00:00.000Z"),
          lastDiscordErrorCode: 10004,
        }),
      ],
    });
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "settings" }),
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const embed = readResponseEmbed(body.data);

    expect(readEmbedFieldValue(embed, "狀態")).toBe("已停用（Bot 已離開伺服器）");
    expect(readEmbedFieldValue(embed, "最近一次發送")).toBe(
      "06/07 10:00，發送失敗，公開報告已停止。",
    );
    expect(readEmbedFieldValue(embed, "發送說明")).toBe(
      "公開報告已停止；重新啟用或設定頻道後，會從下一個爬蟲輪次開始。",
    );
    expect(JSON.stringify(body.data.components)).toContain("public-report:enable");
  });

  it("describes a rate-limited public delivery without operational terms", async () => {
    const client = createDiscordBotClient({
      publicPriceReportDeliveries: [
        publicPriceReportDelivery({
          id: "delivery-rate-limited",
          crawlRunId: "crawl-run-rate-limited",
          channelId: "999988887777666655",
          status: "RATE_LIMITED",
          errorCategory: "RATE_LIMITED",
          createdAt: new Date("2026-06-07T01:00:00.000Z"),
          updatedAt: new Date("2026-06-07T02:00:00.000Z"),
        }),
      ],
      publicPriceReportSettings: [publicPriceReportSetting({ id: "public-setting-1" })],
    });
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "settings" }),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const latestDelivery = readEmbedFieldValue(readResponseEmbed(requestBody.data), "最近一次發送");

    expect(latestDelivery).toBe("06/07 10:00，Discord 暫時無法接收訊息，bot 會稍後再試。");
    expect(latestDelivery).not.toContain("限流");
  });

  it("sets the current channel as the public report channel", async () => {
    const client = createDiscordBotClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportButtonInteraction("public-report:set-channel"),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ type: 6 });
    expect(client.discordPublicPriceReportSetting.upsert).toHaveBeenCalledWith({
      where: {
        discordGuildId: "guild-1",
      },
      create: expect.objectContaining({
        discordGuildId: "guild-1",
        channelId: "999988887777666655",
        enabled: true,
        accessStatus: "ACTIVE",
        disabledAt: null,
        lastDiscordErrorCode: null,
        consecutiveAccessFailures: 0,
        retryNotBefore: null,
        createdByDiscordUserId: "111122223333444455",
        updatedByDiscordUserId: "111122223333444455",
      }),
      update: expect.objectContaining({
        channelId: "999988887777666655",
        enabled: true,
        accessStatus: "ACTIVE",
        disabledAt: null,
        lastDiscordErrorCode: null,
        consecutiveAccessFailures: 0,
        retryNotBefore: null,
        updatedByDiscordUserId: "111122223333444455",
      }),
      select: expect.not.objectContaining({
        maxItems: true,
        createdByDiscordUserId: true,
        updatedByDiscordUserId: true,
      }),
    });

    const updateBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(updateBody.embeds)).toContain("已將公開報告頻道設為");
    expect(JSON.stringify(updateBody.components)).toContain("public-report:preview");
    expect(JSON.stringify(updateBody.components)).toContain("public-report:disable");
  });

  it("does not save the public report channel when the bot cannot embed messages there", async () => {
    const client = createDiscordBotClient();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportButtonInteraction("public-report:set-channel", {
        appPermissions: "2048",
      }),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ type: 6 });
    expect(client.discordPublicPriceReportSetting.upsert).not.toHaveBeenCalled();

    const responseBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

    expect(responseBody.content).toContain("目前無法在 <#999988887777666655> 發送訊息");
    expect(responseBody.content).toContain("嵌入連結");
    expect(responseBody.content).not.toContain("Administrator");
  });
});
