// apps/crawler/tests/scripts/ops/discord-bot/price-report-settings-categories.test.ts
import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createComponentInteraction,
  createDiscordBotClient,
  createDiscordBotOptions,
  createSelectComponentInteraction,
  priceReportSetting,
  readEmbedFieldValue,
  readResponseEmbed,
} from "./support";

describe("handleDiscordInteraction price report settings categories", () => {
  it("resets category choices to all categories from the settings panel", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          categoryIgrps: [7, 12],
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
      interaction: createComponentInteraction("price-report:settings:all-categories"),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          categoryIgrps: [],
        }),
        update: expect.objectContaining({
          categoryIgrps: [],
        }),
      }),
    );
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({ type: 6 });
    const updatedBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );

    expect(readEmbedFieldValue(readResponseEmbed(updatedBody), "分類")).toBe("全部分類");
    expect(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body)).not.toContain(
      "price-report:settings:all-categories",
    );
  });

  it("updates category choices from the settings panel", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createSelectComponentInteraction("price-report:settings:categories", [
        "7",
        "12",
      ]),
    });

    expect(client.discordPriceReportSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          categoryIgrps: [7, 12],
        }),
        update: expect.objectContaining({
          categoryIgrps: [7, 12],
        }),
      }),
    );
    const updatedBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );
    const categorySelect = updatedBody.components[1].components[0];

    expect(categorySelect.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "SSD / HDD", default: true }),
        expect.objectContaining({ label: "顯示卡", default: true }),
        expect.objectContaining({ label: "CPU", default: false }),
      ]),
    );
    expect(categorySelect.options).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "全部分類" })]),
    );
    expect(updatedBody.components[2].components[0]).toEqual(
      expect.objectContaining({
        custom_id: "price-report:settings:all-categories",
        label: "改為全部分類",
      }),
    );
  });

  it("disables daily report settings from the settings button", async () => {
    const client = createDiscordBotClient(
      [],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
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
      interaction: createComponentInteraction("price-report:settings:disable"),
    });

    expect(client.discordPriceReportSetting.updateMany).toHaveBeenCalledWith({
      where: {
        discordUserId: "111122223333444455",
        enabled: true,
      },
      data: {
        enabled: false,
        nextSendAt: null,
      },
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({ type: 6 });
    expect(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body)).toContain(
      "已關閉每日價格提醒",
    );
  });
});
