// apps/crawler/tests/scripts/ops/discord-bot/price-report-settings-modals.test.ts
// 驗證個人價格報告設定面板開啟 modal、預填值，以及時間與上限 modal 提交驗證。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import { MAX_PRICE_REPORT_KEYWORD_GROUPS } from "../../../../src/scripts/ops/discord-bot/constants";
import {
  createComponentInteraction,
  createDiscordBotClient,
  createDiscordBotOptions,
  createSettingsModalSubmitInteraction,
  priceReportSetting,
} from "./support";

describe("handleDiscordInteraction price report settings modals", () => {
  it("opens a time and limit modal from the settings panel", async () => {
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
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
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
      interaction: createComponentInteraction("price-report:settings:time-limit"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: "price-report:settings:time-limit-modal",
        title: "每日報告時間與上限",
      },
    });
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"12"');
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"21:30"');
    expect(JSON.stringify(requestBody.data.components)).not.toContain(
      "price-report:settings:categories",
    );
  });

  it("opens a keyword modal from the settings panel", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          productKeyword: "RTX 5090",
          nextSendAt: new Date("2026-06-07T13:30:00.000Z"),
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
      interaction: createComponentInteraction("price-report:settings:keyword"),
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );

    expect(requestBody).toMatchObject({
      type: 9,
      data: {
        custom_id: "price-report:settings:keyword-modal",
        title: "價格報告關鍵字",
      },
    });
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"RTX 5090"');
    expect(requestBody.data.components[0]).toEqual({
      type: 10,
      content: [
        "**格式說明**",
        "留空：不限制商品名稱。",
        "空白：同一組關鍵字都要符合，例如 `RTX 5090`。",
        `逗號：多組擇一符合，最多 ${MAX_PRICE_REPORT_KEYWORD_GROUPS} 組，例如 \`RTX 5090, DDR5\`。`,
      ].join("\n"),
    });
    expect(requestBody.data.components[1]).toMatchObject({
      type: 18,
      label: "商品名稱關鍵字",
      component: {
        type: 4,
        custom_id: "price-report:settings:keyword-input",
        value: "RTX 5090",
      },
    });
    expect(requestBody.data.components[1]).not.toHaveProperty("description");
  });

  it("updates daily report time and item limit from the settings modal", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          window: "HOURS_12",
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
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
      interaction: createSettingsModalSubmitInteraction({
        maxItems: "8",
        time: "21:30",
      }),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          window: "HOURS_12",
          maxItems: 8,
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: false,
          enabled: true,
        }),
        update: expect.objectContaining({
          window: "HOURS_12",
          maxItems: 8,
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: false,
          enabled: true,
        }),
      }),
    );
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)).toContain(
      "已更新每日價格提醒",
    );
  });

  it("rejects invalid daily report modal values", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createSettingsModalSubmitInteraction({
        maxItems: "0",
        time: "25:99",
      }),
    });

    const requestBody = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body);

    expect(requestBody).toContain("最多商品數需為 1-50 的整數");
    expect(requestBody).toContain("每日發送時間格式需為台北時間 HH:mm");
    expect(client.discordPriceReportSetting.upsert).not.toHaveBeenCalled();
  });
});
