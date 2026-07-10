// apps/crawler/tests/scripts/ops/discord-bot/public-price-report-preview.test.ts
// 驗證公開報告測試發送入口、面板按鈕與頻道權限失敗時的使用者回應。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  API_BASE_URL,
  createDiscordBotClient,
  createDiscordBotOptions,
  createPublicReportButtonInteraction,
  createPublicReportInteraction,
  publicPriceReportSetting,
  snapshot,
  TEST_SOURCE_CATEGORIES,
} from "./support";

describe("public price report previews", () => {
  it("sends a public report preview from the public-report test command", async () => {
    const now = new Date();
    const oldCapturedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const newCapturedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "public-test-old",
          productId: "public-test-product",
          productName: "華碩 GPU A",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: oldCapturedAt,
        }),
        snapshot({
          id: "public-test-new",
          productId: "public-test-product",
          productName: "華碩 GPU A",
          crawlRunId: "new-run",
          price: 10_990,
          capturedAt: newCapturedAt,
        }),
      ],
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
      interaction: createPublicReportInteraction({ subcommandName: "test" }),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: 5,
      data: { flags: 64 },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${API_BASE_URL}/channels/999988887777666655/messages`,
    );
    const responseBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(responseBody.content).toContain("已發送測試公開報告到 <#999988887777666655>");
  });

  it("sends a public report preview to the configured channel", async () => {
    const now = new Date();
    const oldCapturedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const newCapturedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "public-preview-old",
          productId: "public-preview-product",
          productName: "華碩 GPU A",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: oldCapturedAt,
        }),
        snapshot({
          id: "public-preview-new",
          productId: "public-preview-product",
          productName: "華碩 GPU A",
          crawlRunId: "new-run",
          price: 10_990,
          capturedAt: newCapturedAt,
        }),
      ],
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
      interaction: createPublicReportButtonInteraction("public-report:preview"),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: 5,
      data: { flags: 64 },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${API_BASE_URL}/channels/999988887777666655/messages`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "PartsRadarTW 公開價格報告 - 價格變動",
          description: expect.stringContaining("GPU A"),
        }),
      ],
      allowed_mentions: {
        parse: [],
      },
    });
    const responseBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(responseBody.content).toContain("已發送測試公開報告到 <#999988887777666655>");
  });

  it("shows a channel permission hint when the public report preview send fails", async () => {
    const now = new Date();
    const oldCapturedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const newCapturedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "public-preview-old",
          productId: "public-preview-product",
          productName: "華碩 GPU A",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: oldCapturedAt,
        }),
        snapshot({
          id: "public-preview-new",
          productId: "public-preview-product",
          productName: "華碩 GPU A",
          crawlRunId: "new-run",
          price: 10_990,
          capturedAt: newCapturedAt,
        }),
      ],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [],
      [publicPriceReportSetting({ id: "public-setting-1" })],
    );
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/channels/999988887777666655/messages")) {
        return new Response(
          JSON.stringify({
            code: 50013,
            message: "Missing Permissions DISCORD_BOT_TOKEN=private-token",
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
      interaction: createPublicReportButtonInteraction("public-report:preview", {
        channelId: "111111111111111111",
      }),
    });

    const responseBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));

    expect(responseBody.content).toContain("傳送訊息");
    expect(responseBody.content).toContain("嵌入連結");
    expect(responseBody.content).not.toContain("50013");
    expect(responseBody.content).not.toContain("Missing Permissions");
    expect(responseBody.content).not.toContain("private-token");
    expect(responseBody.content).not.toContain("private-authorization");
    expect(responseBody.content).not.toContain("Administrator");
  });
});
