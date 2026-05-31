import { describe, expect, it } from "vitest";
import { CRAWL_TRIGGER_TYPES } from "./crawl-run";
import {
  MAX_COOLPC_RESPONSE_BODY_BYTES,
  readResponseBodyWithLimit,
  validateCoolpcBaseUrl,
  validateCrawlTimingOptions,
  validateRawReplayOptions,
} from "./live-crawl";

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
});
