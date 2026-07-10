// apps/crawler/tests/scripts/ops/discord-webhook/discord-webhook.test.ts
// 驗證 Discord admin webhook 的 URL 驗證、payload 安全預設、rate limit 與錯誤遮蔽。

import { describe, expect, it, vi } from "vitest";
import {
  formatDiscordWebhookText,
  normalizeDiscordWebhookUrl,
  readDiscordWebhookUrl,
  sendDiscordWebhookMessage,
} from "../../../../src/scripts/ops/discord-webhook";

const WEBHOOK_URL = "https://discord.com/api/webhooks/1234567890/token_ABC.def-ghi";

describe("Discord webhook URL handling", () => {
  it("reads missing and placeholder webhook env values as disabled", () => {
    expect(readDiscordWebhookUrl({}, "DISCORD_ADMIN_WEBHOOK_URL")).toBeNull();
    expect(
      readDiscordWebhookUrl(
        { DISCORD_ADMIN_WEBHOOK_URL: "replace_with_discord_admin_webhook_url" },
        "DISCORD_ADMIN_WEBHOOK_URL",
      ),
    ).toBeNull();
  });

  it("accepts Discord webhook URLs and strips fragments", () => {
    expect(normalizeDiscordWebhookUrl(`${WEBHOOK_URL}#secret`)).toBe(WEBHOOK_URL);
  });

  it("rejects non-Discord or non-HTTPS webhook URLs", () => {
    expect(() => normalizeDiscordWebhookUrl("http://discord.com/api/webhooks/123/token")).toThrow(
      "must be a valid Discord webhook URL",
    );
    expect(() => normalizeDiscordWebhookUrl("https://example.com/api/webhooks/123/token")).toThrow(
      "must be a valid Discord webhook URL",
    );
  });
});

describe("sendDiscordWebhookMessage", () => {
  it("skips sending when the webhook URL is not configured", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    await expect(
      sendDiscordWebhookMessage({
        webhookUrl: null,
        message: { content: "PartsRadarTW status: WARN" },
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "missing_webhook_url",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a sanitized payload with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    const result = await sendDiscordWebhookMessage({
      webhookUrl: WEBHOOK_URL,
      message: {
        content: "PartsRadarTW status: FAIL @everyone",
        username: "PartsRadarTW ops",
      },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result).toEqual({
      status: "sent",
      httpStatus: 204,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchMock.mock.calls[0] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    expect(String(url)).toBe(WEBHOOK_URL);
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      "content-type": "application/json",
    });

    const payload = JSON.parse(String(requestInit?.body)) as {
      content: string;
      allowed_mentions: { parse: [] };
      username: string;
    };
    expect(payload).toEqual({
      content: "PartsRadarTW status: FAIL @everyone",
      username: "PartsRadarTW ops",
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("posts embed-only payloads with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    await expect(
      sendDiscordWebhookMessage({
        webhookUrl: WEBHOOK_URL,
        message: {
          username: "PartsRadarTW",
          embeds: [
            {
              title: "PartsRadarTW price changes",
              description: "GPU A changed price",
              color: 0x2563eb,
              timestamp: "2026-06-07T02:00:00.000Z",
            },
          ],
        },
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      httpStatus: 204,
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [Parameters<typeof fetch>[0], RequestInit];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      username: "PartsRadarTW",
      embeds: [
        {
          title: "PartsRadarTW price changes",
          description: "GPU A changed price",
          color: 0x2563eb,
          timestamp: "2026-06-07T02:00:00.000Z",
        },
      ],
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("returns Discord rate limit retry timing without retrying immediately", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ retry_after: 9, global: true }), {
          status: 429,
          headers: {
            "retry-after": "2.5",
          },
        }),
    );

    await expect(
      sendDiscordWebhookMessage({
        webhookUrl: WEBHOOK_URL,
        message: { content: "PartsRadarTW status: WARN" },
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "rate_limited",
      httpStatus: 429,
      retryAfterMs: 2500,
      global: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the JSON retry_after field when the Retry-After header is absent", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ retry_after: 1.25, global: false }), {
          status: 429,
        }),
    );

    await expect(
      sendDiscordWebhookMessage({
        webhookUrl: WEBHOOK_URL,
        message: { content: "PartsRadarTW status: FAIL" },
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "rate_limited",
      httpStatus: 429,
      retryAfterMs: 1250,
      global: false,
    });
  });

  it("returns a safe failed result for non-2xx responses", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response("server error", {
          status: 500,
          headers: {
            "retry-after": "3",
          },
        }),
    );

    await expect(
      sendDiscordWebhookMessage({
        webhookUrl: WEBHOOK_URL,
        message: { content: "PartsRadarTW status: WARN" },
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "failed",
      httpStatus: 500,
      message: "Discord webhook returned HTTP 500.",
      retryAfterMs: 3000,
    });
  });

  it("sanitizes network error messages", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error(
        `failed ${WEBHOOK_URL} DATABASE_URL=postgresql://user:pass@localhost:5432/app`,
      );
    });

    const result = await sendDiscordWebhookMessage({
      webhookUrl: WEBHOOK_URL,
      message: { content: "PartsRadarTW status: WARN" },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result).toMatchObject({
      status: "failed",
      httpStatus: null,
    });
    if (result.status !== "failed") {
      throw new Error("Expected failed result.");
    }
    expect(result.message).not.toContain("token_ABC");
    expect(result.message).not.toContain("user:pass");
    expect(result.message).toContain("DATABASE_URL=***");
  });

  it("rejects empty messages before sending", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    await expect(
      sendDiscordWebhookMessage({
        webhookUrl: WEBHOOK_URL,
        message: { content: "   " },
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).rejects.toThrow("must include content or at least one embed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("formatDiscordWebhookText", () => {
  it("does not apply notification policy filtering to regular payload text", () => {
    expect(formatDiscordWebhookText("PartsRadarTW status: WARN @everyone")).toBe(
      "PartsRadarTW status: WARN @everyone",
    );
  });

  it("replaces non-whitespace control characters", () => {
    expect(formatDiscordWebhookText("a\u0000b\nc")).toBe("a b\nc");
  });

  it("truncates long values", () => {
    expect(formatDiscordWebhookText("abcdef", 5)).toBe("ab...");
  });
});
