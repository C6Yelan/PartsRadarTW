// apps/crawler/tests/scripts/ops/discord-bot-transport.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  sendDiscordChannelMessages,
  sendDiscordDirectMessages,
  sendDiscordInteractionMessages,
} from "../../../src/scripts/ops/discord-bot/rest";

import { API_BASE_URL, APPLICATION_ID, TOKEN } from "./discord-bot/support";

describe("sendDiscordDirectMessages", () => {
  it("creates a DM channel and posts all report messages with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, requestInit) => {
      if (String(requestInit?.body).includes("recipient_id")) {
        return new Response(JSON.stringify({ id: "dm-channel" }), { status: 200 });
      }

      return new Response(JSON.stringify({ id: "message" }), { status: 200 });
    });

    await expect(
      sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        messages: [{ content: "Report 1" }, { content: "Report 2 @everyone" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      messageCount: 2,
      httpStatuses: [200, 200],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, secondRequest] = fetchMock.mock.calls[1] as [Parameters<typeof fetch>[0], RequestInit];
    expect(JSON.parse(String(secondRequest.body))).toMatchObject({
      content: "Report 1",
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("uses Discord JSON retry_after when rate limited without a Retry-After header", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ retry_after: 1.25, global: true }), {
          status: 429,
        }),
    );

    await expect(
      sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        messages: [{ content: "Report" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "rate_limited",
      messageCount: 1,
      sentMessageCount: 0,
      retryAfterMs: 1250,
      global: true,
    });
  });
});

describe("sendDiscordChannelMessages", () => {
  it("posts messages to a channel with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordChannelMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        channelId: "999988887777666655",
        messages: [{ content: "Public report @everyone" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      messageCount: 1,
      httpStatuses: [200],
    });

    const [url, request] = fetchMock.mock.calls[0] as [Parameters<typeof fetch>[0], RequestInit];
    expect(String(url)).toBe(`${API_BASE_URL}/channels/999988887777666655/messages`);
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({
      content: "Public report @everyone",
      allowed_mentions: {
        parse: [],
      },
    });
  });
});

describe("sendDiscordInteractionMessages", () => {
  it("edits the original command response and posts follow-up chunks", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordInteractionMessages({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        apiBaseUrl: API_BASE_URL,
        interaction: {
          id: "interaction-1",
          token: "interaction-token",
          type: 2,
        },
        messages: [{ content: "Report 1" }, { content: "Report 2 @everyone" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      messageCount: 2,
      httpStatuses: [200, 200],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstRequest] = fetchMock.mock.calls[0] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    const [secondUrl, secondRequest] = fetchMock.mock.calls[1] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    expect(String(firstUrl)).toBe(
      `${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token/messages/@original`,
    );
    expect(firstRequest.method).toBe("PATCH");
    expect(JSON.parse(String(firstRequest.body))).toEqual({
      content: "Report 1",
      allowed_mentions: {
        parse: [],
      },
    });
    expect(String(secondUrl)).toBe(`${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token`);
    expect(secondRequest.method).toBe("POST");
    expect(JSON.parse(String(secondRequest.body))).toEqual({
      content: "Report 2 @everyone",
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("sends embed payloads with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordInteractionMessages({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        apiBaseUrl: API_BASE_URL,
        interaction: {
          id: "interaction-1",
          token: "interaction-token",
          type: 2,
        },
        messages: [
          {
            embeds: [
              {
                title: "PartsRadarTW 價格報告",
                description: "過去 24 小時：價格變動 1，新增商品 0",
              },
            ],
          },
        ],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      messageCount: 1,
    });

    const [, request] = fetchMock.mock.calls[0] as [Parameters<typeof fetch>[0], RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      embeds: [
        {
          title: "PartsRadarTW 價格報告",
          description: "過去 24 小時：價格變動 1，新增商品 0",
        },
      ],
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("can keep all interaction report chunks ephemeral", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordInteractionMessages({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        apiBaseUrl: API_BASE_URL,
        interaction: {
          id: "interaction-1",
          token: "interaction-token",
          type: 2,
        },
        messages: [{ content: "Preview 1" }, { content: "Preview 2" }],
        fetchImpl: fetchMock as typeof fetch,
        ephemeral: true,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      messageCount: 2,
    });

    const payloads = fetchMock.mock.calls.map(([, requestInit]) =>
      JSON.parse(String((requestInit as RequestInit | undefined)?.body)),
    );

    expect(payloads).toEqual([
      expect.objectContaining({ content: "Preview 1", flags: 64 }),
      expect.objectContaining({ content: "Preview 2", flags: 64 }),
    ]);
  });
});
