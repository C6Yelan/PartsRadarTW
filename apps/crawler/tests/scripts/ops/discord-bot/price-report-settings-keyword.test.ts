// apps/crawler/tests/scripts/ops/discord-bot/price-report-settings-keyword.test.ts
// 驗證個人價格報告關鍵字 modal 的輸入正規化、上限拒絕與清空流程。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  MAX_PRICE_REPORT_KEYWORD_GROUPS,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
} from "../../../../src/scripts/ops/discord-bot/constants";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createKeywordModalSubmitInteraction,
  priceReportSetting,
  readEmbedFieldValue,
  readResponseEmbed,
} from "./support";

describe("handleDiscordInteraction price report settings keyword", () => {
  it("updates the daily report product keyword from the settings modal", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          window: "HOURS_12",
          maxItems: 12,
          categoryIgrps: [12],
          includeNewProducts: false,
          nextSendAt: new Date("2026-06-07T01:00:00.000Z"),
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
      interaction: createKeywordModalSubmitInteraction({ keyword: " RTX   5090，  DDR5 " }),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          window: "HOURS_12",
          maxItems: 12,
          categoryIgrps: [12],
          productKeyword: "RTX 5090, DDR5",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: false,
          enabled: true,
        }),
        update: expect.objectContaining({
          window: "HOURS_12",
          maxItems: 12,
          categoryIgrps: [12],
          productKeyword: "RTX 5090, DDR5",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: false,
          enabled: true,
        }),
      }),
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(readEmbedFieldValue(readResponseEmbed(requestBody), "商品關鍵字")).toBe(
      "RTX 5090, DDR5",
    );
  });

  it("rejects daily report keywords with too many groups", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createKeywordModalSubmitInteraction({
        keyword: "RTX 5090, DDR5, SSD, RAM, CPU, GPU",
      }),
    });

    const requestBody = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body);

    expect(requestBody).toContain(`最多 ${MAX_PRICE_REPORT_KEYWORD_LENGTH} 個字`);
    expect(requestBody).toContain(`最多 ${MAX_PRICE_REPORT_KEYWORD_GROUPS} 組`);
    expect(client.discordPriceReportSetting.upsert).not.toHaveBeenCalled();
  });

  it("clears the daily report product keyword from the settings modal", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          productKeyword: "RTX 5090",
          nextSendAt: new Date("2026-06-07T01:00:00.000Z"),
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
      interaction: createKeywordModalSubmitInteraction({ keyword: "" }),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          productKeyword: null,
        }),
        update: expect.objectContaining({
          productKeyword: null,
        }),
      }),
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(readEmbedFieldValue(readResponseEmbed(requestBody), "商品關鍵字")).toBe("不限");
  });
});
