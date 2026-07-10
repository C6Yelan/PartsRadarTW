// apps/crawler/tests/scripts/ops/discord-bot/price-report/price-report-settings-preview.test.ts
// 驗證個人價格報告設定面板的預覽 DM 發送、delivery 紀錄與失敗訊息泛化。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/interactions";
import {
  API_BASE_URL,
  APPLICATION_ID,
  createComponentInteraction,
  createDiscordBotClient,
  createDiscordBotOptions,
  priceReportSetting,
  snapshot,
} from "../support";

describe("handleDiscordInteraction price report settings preview", () => {
  it("sends the configured price report preview as a DM from the settings panel", async () => {
    const now = new Date();
    const oldCapturedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const newCapturedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "preview-old",
          productId: "preview-product",
          productName: "華碩 RTX 5070 測試卡",
          crawlRunId: "old-run",
          price: 20_000,
          capturedAt: oldCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "preview-new",
          productId: "preview-product",
          productName: "華碩 RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 18_990,
          capturedAt: newCapturedAt,
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
      ],
      settings: [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          categoryIgrps: [12],
          productKeyword: "RTX 5070",
          includeNewProducts: false,
          enabled: false,
          nextSendAt: null,
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
      interaction: createComponentInteraction("price-report:settings:preview"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: 5,
      data: { flags: 64 },
    });

    const previewBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    const settingsBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API_BASE_URL}/users/@me/channels`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      recipient_id: "111122223333444455",
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`${API_BASE_URL}/channels/message/messages`);
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token/messages/@original`,
    );
    expect(previewBody).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "PartsRadarTW 價格報告 - 價格變動",
          description: expect.stringContaining("RTX 5070"),
        }),
      ],
      allowed_mentions: {
        parse: [],
      },
    });
    expect(JSON.stringify(settingsBody)).toContain("已傳送預覽 DM");
    expect(JSON.stringify(previewBody)).not.toContain("新增商品");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordUserId: "111122223333444455",
        kind: "PRICE_REPORT_NOW",
        status: "SENT",
      }),
    });
  });

  it("shows a readable DM failure when the price report preview cannot be delivered", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "preview-new",
          productId: "preview-product",
          productName: "華碩 RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 18_990,
          capturedAt: new Date().toISOString(),
        }),
      ],
      settings: [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          enabled: false,
          nextSendAt: null,
        }),
      ],
    });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/users/@me/channels")) {
        return new Response(
          JSON.stringify({
            code: 50007,
            message: "Cannot send messages to this user DISCORD_BOT_TOKEN=private-token",
            errors: { authorization: "Bearer private-authorization" },
          }),
          { status: 403 },
        );
      }

      return new Response(JSON.stringify({ id: "message" }), { status: 200 });
    });

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createComponentInteraction("price-report:settings:preview"),
    });

    const settingsBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));

    expect(JSON.stringify(settingsBody)).toContain("我目前無法傳送私訊給你");
    expect(JSON.stringify(settingsBody)).not.toContain("50007");
    expect(JSON.stringify(settingsBody)).not.toContain("Cannot send messages");
    expect(JSON.stringify(settingsBody)).not.toContain("private-token");
    expect(JSON.stringify(settingsBody)).not.toContain("private-authorization");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordUserId: "111122223333444455",
        kind: "PRICE_REPORT_NOW",
        status: "FAILED",
        errorCategory: "DM_UNAVAILABLE",
        errorMessage: null,
        httpStatus: 403,
        providerErrorCode: 50007,
      }),
    });
    expect(JSON.stringify(client.discordNotificationDelivery.create.mock.calls)).not.toContain(
      "private-token",
    );
    expect(JSON.stringify(client.discordNotificationDelivery.create.mock.calls)).not.toContain(
      "private-authorization",
    );
  });
});
