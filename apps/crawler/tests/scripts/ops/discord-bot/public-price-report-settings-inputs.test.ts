// apps/crawler/tests/scripts/ops/discord-bot/public-price-report-settings-inputs.test.ts
// 驗證公開報告設定面板與 modal 輸入會正確更新分類、內容類型與關鍵字。

import { describe, expect, it, vi } from "vitest";
import {
  MAX_PRICE_REPORT_KEYWORD_GROUPS,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
} from "../../../../src/scripts/ops/discord-bot/constants";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createPublicReportKeywordModalSubmitInteraction,
  createPublicReportSelectInteraction,
  publicPriceReportSetting,
  TEST_SOURCE_CATEGORIES,
} from "./support";

describe("public price report settings inputs", () => {
  it("updates public report categories from the settings panel", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
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
      interaction: createPublicReportSelectInteraction("public-report:categories", ["12", "6"]),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ type: 6 });
    expect(client.discordPublicPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        discordGuildId: "guild-1",
      },
      data: expect.objectContaining({
        categoryIgrps: [6, 12],
        includePriceDrops: true,
        includePriceRises: true,
        updatedByDiscordUserId: "111122223333444455",
      }),
      select: expect.any(Object),
    });

    const updateBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(updateBody.embeds)).toContain("已更新公開價格報告設定");
    expect(JSON.stringify(updateBody.embeds)).toContain("記憶體、顯示卡");
    expect(JSON.stringify(updateBody.components)).toContain("改為全部分類");
  });

  it("updates public report content filters from the settings panel", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
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
      interaction: createPublicReportSelectInteraction("public-report:events", ["price_drops"]),
    });

    expect(client.discordPublicPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        discordGuildId: "guild-1",
      },
      data: expect.objectContaining({
        includePriceDrops: true,
        includePriceRises: false,
        includeNewProducts: false,
      }),
      select: expect.any(Object),
    });

    const updateBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(updateBody.embeds)).toContain("降價");
    expect(JSON.stringify(updateBody.embeds)).not.toContain("降價、漲價");
  });

  it("allows public reports to include new products", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
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
      interaction: createPublicReportSelectInteraction("public-report:events", [
        "price_drops",
        "new_products",
      ]),
    });

    expect(client.discordPublicPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        discordGuildId: "guild-1",
      },
      data: expect.objectContaining({
        includePriceDrops: true,
        includePriceRises: false,
        includeNewProducts: true,
      }),
      select: expect.any(Object),
    });

    const updateBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(updateBody.embeds)).toContain("降價、新增商品");
  });

  it("updates the public report product keyword from the keyword modal", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
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
      interaction: createPublicReportKeywordModalSubmitInteraction({
        keywords: ["RTX 5090", "DDR5", "SSD", "RAM", "CPU"],
      }),
    });

    expect(client.discordPublicPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        discordGuildId: "guild-1",
      },
      data: expect.objectContaining({
        productKeyword: "RTX 5090, DDR5, SSD, RAM, CPU",
      }),
      select: expect.any(Object),
    });

    const responseBody = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body);
    expect(responseBody).toContain("已更新公開報告關鍵字：RTX 5090, DDR5, SSD, RAM, CPU");
    expect(responseBody).toContain("RTX 5090, DDR5, SSD, RAM, CPU");
    const update = client.discordPublicPriceReportSetting.update.mock.calls[0]?.[0];
    expect(update.data).not.toHaveProperty("maxItems");
    expect(update.select).not.toHaveProperty("maxItems");
    expect(update.select).not.toHaveProperty("createdByDiscordUserId");
    expect(update.select).not.toHaveProperty("updatedByDiscordUserId");
  });

  it("clears the public report product keyword when all five fields are empty", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [],
      [
        publicPriceReportSetting({
          id: "public-setting-1",
          productKeyword: "RTX 5090",
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
      interaction: createPublicReportKeywordModalSubmitInteraction({ keywords: [] }),
    });

    expect(client.discordPublicPriceReportSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productKeyword: null }),
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("已清除公開報告關鍵字篩選");
  });

  it("rejects public report keywords with too many groups", async () => {
    const client = createDiscordBotClient(
      [],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
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
      interaction: createPublicReportKeywordModalSubmitInteraction({
        keywords: ["RTX 5090, DDR5, SSD, RAM, CPU, GPU"],
      }),
    });

    const responseBody = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body);

    expect(responseBody).toContain(`最多 ${MAX_PRICE_REPORT_KEYWORD_LENGTH} 個字`);
    expect(responseBody).toContain(`最多 ${MAX_PRICE_REPORT_KEYWORD_GROUPS} 組`);
    expect(client.discordPublicPriceReportSetting.update).not.toHaveBeenCalled();
  });
});
