// apps/crawler/tests/scripts/ops/discord-bot/public-price-report-settings-panel.test.ts
// 驗證公開報告狀態、管理面板、頻道設定與 bot 權限不足時的回應。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createPublicReportButtonInteraction,
  createPublicReportInteraction,
  publicPriceReportDelivery,
  publicPriceReportSetting,
  readEmbedFieldValue,
  readResponseEmbed,
  TEST_SOURCE_CATEGORIES,
} from "./support";

describe("public price report settings panel", () => {
  it("shows the public report status from the public-report status command", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "status" }),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(requestBody).toMatchObject({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          expect.objectContaining({
            title: "公開價格報告狀態",
            description: expect.stringContaining("最近一次發送紀錄"),
            fields: expect.arrayContaining([
              expect.objectContaining({ name: "狀態", value: "尚未設定" }),
              expect.objectContaining({ name: "發送頻道", value: "尚未設定" }),
              expect.objectContaining({ name: "目前頻道", value: "<#999988887777666655>" }),
            ]),
          }),
        ],
      },
    });
    expect(requestBody.data.components).toBeUndefined();
  });

  it("shows the public report settings panel from the public-report manage command", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "manage" }),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(requestBody).toMatchObject({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          expect.objectContaining({
            title: "公開價格報告設定",
            description: expect.stringContaining("價格變動或新增商品"),
            fields: expect.arrayContaining([
              expect.objectContaining({ name: "狀態", value: "尚未設定" }),
              expect.objectContaining({ name: "發送頻道", value: "尚未設定" }),
              expect.objectContaining({ name: "目前頻道", value: "<#999988887777666655>" }),
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
  });

  it("shows the most recently retried public delivery by updated timestamp", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [
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
      [],
      [publicPriceReportSetting({ id: "public-setting-1" })],
    );
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction({ subcommandName: "status" }),
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const latestDelivery = readEmbedFieldValue(
      readResponseEmbed(requestBody.data),
      "最近一次公開報告",
    );

    expect(latestDelivery).toContain("失敗：06/07 10:00 GMT+8");
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

  it("sets the current channel as the public report channel", async () => {
    const client = createDiscordBotClient([]);
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
        createdByDiscordUserId: "111122223333444455",
        updatedByDiscordUserId: "111122223333444455",
      }),
      update: expect.objectContaining({
        channelId: "999988887777666655",
        enabled: true,
        updatedByDiscordUserId: "111122223333444455",
      }),
      select: expect.any(Object),
    });

    const updateBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(updateBody.embeds)).toContain("已將公開報告頻道設為");
    expect(JSON.stringify(updateBody.components)).toContain("public-report:preview");
    expect(JSON.stringify(updateBody.components)).toContain("public-report:disable");
  });

  it("does not save the public report channel when the bot cannot embed messages there", async () => {
    const client = createDiscordBotClient([]);
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

    expect(responseBody.content).toContain("無法在 <#999988887777666655> 發送公開價格報告");
    expect(responseBody.content).toContain("嵌入連結");
    expect(responseBody.content).not.toContain("Administrator");
  });
});
