// apps/crawler/tests/scripts/ops/discord-bot/price-report-settings-modals.test.ts
// 驗證個人價格報告設定面板開啟 modal、預填值，以及時間與上限 modal 提交驗證。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createComponentInteraction,
  createDiscordBotClient,
  createDiscordBotOptions,
  createSettingsModalSubmitInteraction,
  priceReportSetting,
} from "./support";

describe("handleDiscordInteraction price report settings modals", () => {
  it("opens a time-only modal while preserving the existing wire ids", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          window: "HOURS_12",
          categoryIgrps: [12],
          includeNewProducts: true,
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
        title: "每日報告時間",
      },
    });
    expect(requestBody.data.components).toHaveLength(1);
    expect(JSON.stringify(requestBody.data.components)).toContain('"value":"21:30"');
    expect(JSON.stringify(requestBody.data.components)).not.toContain(
      "price-report:settings:max-items",
    );
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
          productKeyword: "RTX 5090, DDR5",
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
    expect(requestBody.data.components).toHaveLength(5);
    expect(requestBody.data.components[0]).toMatchObject({
      type: 18,
      label: "關鍵字組 1（不同格擇一）",
      component: {
        type: 4,
        custom_id: "price-report:settings:keyword-input",
        value: "RTX 5090",
      },
    });
    expect(requestBody.data.components[1]).toMatchObject({
      component: {
        custom_id: "price-report:settings:keyword-input:2",
        value: "DDR5",
      },
    });
    expect(requestBody.data.components[4].component.custom_id).toBe(
      "price-report:settings:keyword-input:5",
    );
  });

  it("normalizes full-width daily report time without rewriting dormant max-items", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          maxItems: 8,
          window: "HOURS_12",
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includeNewProducts: true,
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
        time: "２１ ： ３０",
      }),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          window: "HOURS_12",
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: true,
          enabled: true,
        }),
        update: expect.objectContaining({
          window: "HOURS_12",
          categoryIgrps: [12],
          productKeyword: "RTX 5090",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: true,
          enabled: true,
        }),
      }),
    );
    const upsert = client.discordPriceReportSetting.upsert.mock.calls[0]?.[0];
    expect(upsert.create).not.toHaveProperty("maxItems");
    expect(upsert.update).not.toHaveProperty("maxItems");
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)).toContain(
      "已更新每日價格提醒",
    );
  });

  it.each([
    "２４：００",
    "１２，３０",
    "１２.３０",
    "-1:30",
    "12:30pm",
  ])("rejects invalid daily report time %s", async (time) => {
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
        time,
      }),
    });

    const requestBody = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body);

    expect(requestBody).toContain("每日發送時間格式需為台北時間 HH:mm");
    expect(client.discordPriceReportSetting.upsert).not.toHaveBeenCalled();
  });
});
