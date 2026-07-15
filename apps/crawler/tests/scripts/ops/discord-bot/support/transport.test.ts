// apps/crawler/tests/scripts/ops/discord-bot/support/transport.test.ts
// 驗證 Discord bot REST transport 的訊息發送、mention 防護、rate limit 與 interaction 回覆行為。

import { describe, expect, it, vi } from "vitest";
import {
  formatDiscordRestFailure,
  sendDiscordChannelMessages,
  sendDiscordDirectMessages,
  sendDiscordInteractionMessages,
  sendDiscordRestRequest,
} from "../../../../../src/scripts/ops/discord-bot/rest";

import { API_BASE_URL, APPLICATION_ID, TOKEN } from ".";

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
      httpStatus: 429,
      errorCategory: "RATE_LIMITED",
      providerErrorCode: null,
      retryAfterMs: 1250,
      global: true,
    });
  });

  it.each([
    [50007, "Cannot send messages to this user"],
    [50001, "Missing access"],
    [50013, "Missing permissions"],
    [null, "Forbidden"],
  ])(
    "normalizes a DM channel 403 with provider code %s to DM_UNAVAILABLE",
    async (providerErrorCode, providerMessage) => {
      const body =
        providerErrorCode === null
          ? { message: `${providerMessage} private-provider-body` }
          : { code: providerErrorCode, message: `${providerMessage} private-provider-body` };
      const result = await sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        messages: [{ content: "Report" }],
        fetchImpl: vi.fn<typeof fetch>(
          async () => new Response(JSON.stringify(body), { status: 403 }),
        ) as typeof fetch,
      });

      expect(result).toEqual({
        status: "failed",
        messageCount: 1,
        sentMessageCount: 0,
        httpStatus: 403,
        errorCategory: "DM_UNAVAILABLE",
        providerErrorCode,
      });
      expect(JSON.stringify(result)).not.toContain("private-provider-body");
    },
  );

  it("normalizes a 403 while posting to an established DM channel", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/users/@me/channels")) {
        return new Response(JSON.stringify({ id: "dm-channel" }), { status: 200 });
      }

      return new Response(JSON.stringify({ message: "private DM failure" }), { status: 403 });
    });

    await expect(
      sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        messages: [{ content: "Report" }],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "failed",
      messageCount: 1,
      sentMessageCount: 0,
      httpStatus: 403,
      errorCategory: "DM_UNAVAILABLE",
      providerErrorCode: null,
    });
  });

  it("keeps DM transport failures in the TRANSPORT category", async () => {
    await expect(
      sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        messages: [{ content: "Report" }],
        fetchImpl: vi.fn<typeof fetch>(async () => {
          throw new Error("private transport detail");
        }) as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "failed",
      messageCount: 1,
      sentMessageCount: 0,
      httpStatus: null,
      errorCategory: "TRANSPORT",
      providerErrorCode: null,
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

  it("discards provider messages and nested errors before result or log formatting", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            code: 50013,
            message: "Missing Permissions DISCORD_BOT_TOKEN=private-token",
            errors: {
              authorization: "Bearer private-authorization",
              nested: { token: "private-nested-token" },
            },
          }),
          { status: 403 },
        ),
    );
    const result = await sendDiscordRestRequest({
      token: TOKEN,
      apiBaseUrl: API_BASE_URL,
      fetchImpl: fetchMock as typeof fetch,
      method: "POST",
      path: "/channels/999988887777666655/messages",
      body: { content: "test" },
    });

    expect(result).toEqual({
      status: "failed",
      httpStatus: 403,
      errorCategory: "PERMISSIONS",
      providerErrorCode: 50013,
      retryAfterMs: undefined,
    });

    if (result.status === "ok") {
      throw new Error("Expected a failed Discord REST result.");
    }

    const safeOutput = JSON.stringify({ result, log: formatDiscordRestFailure(result) });

    expect(safeOutput).not.toContain("private-token");
    expect(safeOutput).not.toContain("private-authorization");
    expect(safeOutput).not.toContain("private-nested-token");
    expect(safeOutput).not.toContain("Missing Permissions");
    expect(safeOutput).not.toContain("errors");
  });

  it("keeps invalid bot authentication out of the channel-permission category", async () => {
    const result = await sendDiscordRestRequest({
      token: TOKEN,
      apiBaseUrl: API_BASE_URL,
      fetchImpl: vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ message: "401: Unauthorized private-token" }), {
            status: 401,
          }),
      ) as typeof fetch,
      method: "POST",
      path: "/channels/999988887777666655/messages",
      body: { content: "test" },
    });

    expect(result).toEqual({
      status: "failed",
      httpStatus: 401,
      errorCategory: "PROVIDER",
      providerErrorCode: null,
      retryAfterMs: undefined,
    });
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it("classifies transport exceptions without forwarding their message", async () => {
    const result = await sendDiscordRestRequest({
      token: TOKEN,
      apiBaseUrl: API_BASE_URL,
      fetchImpl: vi.fn<typeof fetch>(async () => {
        throw new Error("Authorization: Bot private-transport-token");
      }),
      method: "POST",
      path: "/channels/999988887777666655/messages",
      body: { content: "test" },
    });

    expect(result).toEqual({
      status: "failed",
      httpStatus: null,
      errorCategory: "TRANSPORT",
      providerErrorCode: null,
    });
    expect(JSON.stringify(result)).not.toContain("private-transport-token");
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
