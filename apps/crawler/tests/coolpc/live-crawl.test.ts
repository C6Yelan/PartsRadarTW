// apps/crawler/tests/coolpc/live-crawl.test.ts
// 驗證 CoolPC live crawl 的來源安全限制、請求大小限制、錯誤格式與暫時性失敗重試。

import { describe, expect, it, vi } from "vitest";
import { CRAWL_TRIGGER_TYPES } from "../../src/coolpc/crawl-run";
import {
  fetchLiveCategorySnapshot,
  formatCoolpcFetchError,
  MAX_COOLPC_RESPONSE_BODY_BYTES,
  readResponseBodyWithLimit,
  validateCoolpcBaseUrl,
  validateCrawlTimingOptions,
  validateRawReplayOptions,
} from "../../src/coolpc/live-crawl";

describe("CoolPC live crawl safety guards", () => {
  it("allows only the official CoolPC base URL by default", () => {
    expect(validateCoolpcBaseUrl("https://www.coolpc.com.tw")).toBe("https://www.coolpc.com.tw");
    expect(validateCoolpcBaseUrl("https://www.coolpc.com.tw/")).toBe("https://www.coolpc.com.tw");
  });

  it("rejects non-CoolPC base URLs in production", () => {
    expect(() =>
      validateCoolpcBaseUrl("https://example.test", {
        allowUnsafeBaseUrlForTesting: true,
        nodeEnv: "production",
      }),
    ).toThrow("CoolPC base URL must be https://www.coolpc.com.tw.");
    expect(() => validateCoolpcBaseUrl("http://169.254.169.254")).toThrow(
      "CoolPC base URL must be https://www.coolpc.com.tw.",
    );
    expect(() => validateCoolpcBaseUrl("file:///tmp/coolpc.html")).toThrow(
      "CoolPC base URL must be https://www.coolpc.com.tw.",
    );
  });

  it("keeps non-CoolPC base URL overrides test-only", () => {
    expect(
      validateCoolpcBaseUrl("http://localhost:4173", {
        allowUnsafeBaseUrlForTesting: true,
        nodeEnv: "test",
      }),
    ).toBe("http://localhost:4173");
  });

  it("rejects raw replay for scheduled or production crawler runtime", () => {
    expect(() =>
      validateRawReplayOptions({
        fromRawDir: "temp/raw",
        triggerType: CRAWL_TRIGGER_TYPES.SCHEDULED,
        nodeEnv: "development",
      }),
    ).toThrow("Scheduled CoolPC crawler cannot use raw HTML replay.");

    expect(() =>
      validateRawReplayOptions({
        fromRawDir: "temp/raw",
        triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
        nodeEnv: "production",
      }),
    ).toThrow("Raw HTML replay is disabled in production crawler runtime.");
  });

  it("validates crawl timing option ranges", () => {
    expect(validateCrawlTimingOptions({ delayMs: 1000, fetchTimeoutMs: 5000 })).toEqual({
      delayMs: 1000,
      fetchTimeoutMs: 5000,
    });
    expect(validateCrawlTimingOptions({ delayMs: 60000, fetchTimeoutMs: 60000 })).toEqual({
      delayMs: 60000,
      fetchTimeoutMs: 60000,
    });

    expect(() => validateCrawlTimingOptions({ delayMs: 999, fetchTimeoutMs: 30000 })).toThrow(
      "delayMs must be between 1000 and 60000.",
    );
    expect(() => validateCrawlTimingOptions({ delayMs: 60001, fetchTimeoutMs: 30000 })).toThrow(
      "delayMs must be between 1000 and 60000.",
    );
    expect(() => validateCrawlTimingOptions({ delayMs: 5000.5, fetchTimeoutMs: 30000 })).toThrow(
      "delayMs must be an integer.",
    );
    expect(() => validateCrawlTimingOptions({ delayMs: 5000, fetchTimeoutMs: 4999 })).toThrow(
      "fetchTimeoutMs must be between 5000 and 60000.",
    );
    expect(() => validateCrawlTimingOptions({ delayMs: 5000, fetchTimeoutMs: 60001 })).toThrow(
      "fetchTimeoutMs must be between 5000 and 60000.",
    );
  });

  it("rejects oversized responses before reading when content-length is too large", async () => {
    const response = new Response(null, {
      headers: {
        "content-length": String(MAX_COOLPC_RESPONSE_BODY_BYTES + 1),
      },
    });

    await expect(readResponseBodyWithLimit(response)).rejects.toThrow(
      `CoolPC response body exceeds ${MAX_COOLPC_RESPONSE_BODY_BYTES} bytes.`,
    );
  });

  it("rejects oversized streaming responses without content-length", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]));

    await expect(readResponseBodyWithLimit(response, 2)).rejects.toThrow(
      "CoolPC response body exceeds 2 bytes.",
    );
  });

  it("reads responses within the configured size limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]));

    await expect(readResponseBodyWithLimit(response, 3)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("records fetch error names and cause details", () => {
    const cause = Object.assign(new Error("connection reset by peer"), {
      code: "ECONNRESET",
    });
    const error = new TypeError("fetch failed");
    error.cause = cause;

    expect(formatCoolpcFetchError(error)).toBe(
      "name=TypeError message=fetch failed cause.code=ECONNRESET cause.message=connection reset by peer",
    );
  });

  it("retries a transient category fetch failure before recording the snapshot", async () => {
    const cause = Object.assign(new Error("temporary DNS failure"), {
      code: "EAI_AGAIN",
    });
    const error = new TypeError("fetch failed");
    error.cause = cause;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(new Response("<html>ok</html>", { status: 200 }));
    const sleepMock = vi.fn(async (_ms: number) => {});
    const logs: string[] = [];

    const snapshot = await fetchLiveCategorySnapshot(
      12,
      new Date("2026-06-16T00:00:00.000Z"),
      "https://www.coolpc.com.tw/evaluate.php?ef=clear&gotop=1&genre=0&search=&Submit=%E6%9F%A5%E8%A9%A2&IGrp=12",
      "test-user-agent",
      5000,
      (message) => logs.push(message),
      {
        fetchImpl: fetchMock as typeof fetch,
        retryDelaysMs: [10],
        sleep: sleepMock,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(10);
    expect(logs.join("\n")).toContain("attempt=1/2");
    expect(logs.join("\n")).toContain("cause.code=EAI_AGAIN");
    expect(snapshot).toMatchObject({
      httpStatus: 200,
      fetchError: null,
    });
    expect(snapshot.rawHtml).toContain("ok");
  });
});
