// apps/crawler/tests/scripts/ops/discord-bot/price-report/price-report-settings-panel.test.ts
// 驗證個人價格報告 settings 指令會產生設定摘要與對應的互動元件。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createInteraction,
  priceReportSetting,
  readEmbedFieldValue,
  readResponseEmbed,
} from "../support";

describe("handleDiscordInteraction price report settings panel", () => {
  it("sends the settings panel from the settings command", async () => {
    const client = createDiscordBotClient();
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

    expect(requestBody).toMatchObject({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          expect.objectContaining({
            title: "價格報告設定",
            description: "尚未開啟每日私訊價格報告。",
            fields: expect.arrayContaining([
              expect.objectContaining({ name: "統計區間", value: "過去 24 小時" }),
              expect.objectContaining({ name: "分類", value: "全部分類" }),
              expect.objectContaining({ name: "內容", value: "降價、漲價" }),
              expect.objectContaining({ name: "商品關鍵字", value: "不限" }),
              expect.objectContaining({ name: "每日時間", value: "09:00" }),
              expect.objectContaining({ name: "下一次", value: "啟用後排程" }),
              expect.objectContaining({
                name: "最近一次每日私訊價格報告",
                value: "尚無每日私訊價格報告紀錄。",
              }),
            ]),
          }),
        ],
        components: [
          {
            type: 1,
            components: [
              expect.objectContaining({
                type: 3,
                custom_id: "price-report:settings:window",
                placeholder: "統計區間",
              }),
            ],
          },
          {
            type: 1,
            components: [
              expect.objectContaining({
                type: 3,
                custom_id: "price-report:settings:categories",
                placeholder: "分類篩選",
                options: expect.arrayContaining([
                  expect.objectContaining({
                    label: "顯示卡",
                    value: "12",
                    default: true,
                  }),
                ]),
              }),
            ],
          },
          {
            type: 1,
            components: [
              expect.objectContaining({
                type: 3,
                custom_id: "price-report:settings:events",
                placeholder: "報告內容",
              }),
            ],
          },
          {
            type: 1,
            components: expect.arrayContaining([
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:preview",
                label: "傳送預覽 DM",
              }),
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:keyword",
                label: "調整關鍵字",
              }),
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:time-limit",
                label: "調整時間",
              }),
              expect.objectContaining({
                type: 2,
                custom_id: "price-report:settings:enable",
                label: "開啟每日私訊價格報告",
              }),
            ]),
          },
        ],
      },
    });
    expect(requestBody.data).not.toHaveProperty("content");
    expect(JSON.stringify(requestBody.data.components)).not.toContain(
      "price-report:settings:all-categories",
    );
    expect(JSON.stringify(requestBody.data.embeds)).not.toContain("每次最多");
    expect(client.discordPriceReportSetting.findUnique).toHaveBeenCalledWith({
      where: { discordUserId: "111122223333444455" },
      select: expect.not.objectContaining({ maxItems: true }),
    });
  });

  it("omits the category select when no source categories are available", async () => {
    const client = createDiscordBotClient({
      categories: [],
    });
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

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const components = requestBody.data.components.flatMap(
      (row: { components?: unknown[] }) => row.components ?? [],
    );

    expect(JSON.stringify(components)).not.toContain("price-report:settings:categories");
    expect(components).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 3, options: [], max_values: 0 })]),
    );
  });

  it("shows daily report filter names in the settings summary", async () => {
    const client = createDiscordBotClient({
      settings: [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          categoryIgrps: [12, 7],
          productKeyword: "RTX 5090",
          includePriceRises: false,
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
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
      interaction: createInteraction("settings"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    const embed = readResponseEmbed(requestBody);

    expect(readEmbedFieldValue(embed, "分類")).toBe("SSD / HDD、顯示卡");
    expect(readEmbedFieldValue(embed, "商品關鍵字")).toBe("RTX 5090");
    expect(readEmbedFieldValue(embed, "內容")).toBe("降價、新增商品");
  });
});
