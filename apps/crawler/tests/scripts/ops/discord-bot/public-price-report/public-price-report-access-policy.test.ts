// 驗證公開報告 Discord access 錯誤會正確分成永久停用與暫時退避。

import { describe, expect, it, vi } from "vitest";
import { classifyPublicReportAccessFailure } from "../../../../../src/scripts/ops/discord-bot/public-price-report/access-policy";

const NOW = new Date("2026-07-23T10:00:00.000Z");

describe("public price report access policy", () => {
  it("disables the Guild after 50001 is confirmed as Unknown Guild", async () => {
    const probeAccess = vi.fn(async () => ({
      status: "unavailable" as const,
      resource: "guild" as const,
      result: {
        status: "failed" as const,
        errorCategory: "PROVIDER" as const,
        httpStatus: 404,
        providerErrorCode: 10004,
      },
    }));

    await expect(
      classifyPublicReportAccessFailure({
        result: failedResult(50001),
        settingFailureCount: 0,
        now: NOW,
        probeAccess,
      }),
    ).resolves.toEqual({
      kind: "disable",
      accessStatus: "DISABLED_BOT_REMOVED",
      providerErrorCode: 10004,
    });
    expect(probeAccess).toHaveBeenCalledTimes(1);
  });

  it("pauses a readable Guild and Channel after a permission failure", async () => {
    await expect(
      classifyPublicReportAccessFailure({
        result: failedResult(50013),
        settingFailureCount: 0,
        now: NOW,
        probeAccess: async () => ({ status: "accessible" }),
      }),
    ).resolves.toEqual({
      kind: "disable",
      accessStatus: "PAUSED_PERMISSION",
      providerErrorCode: 50013,
    });
  });

  it("pauses when the Guild is readable but the Channel probe lacks permission", async () => {
    await expect(
      classifyPublicReportAccessFailure({
        result: failedResult(50001),
        settingFailureCount: 0,
        now: NOW,
        probeAccess: async () => ({
          status: "unavailable",
          resource: "channel",
          result: {
            status: "failed",
            errorCategory: "PERMISSIONS",
            httpStatus: 403,
            providerErrorCode: 50013,
          },
        }),
      }),
    ).resolves.toEqual({
      kind: "disable",
      accessStatus: "PAUSED_PERMISSION",
      providerErrorCode: 50013,
    });
  });

  it("uses retry_after for 429 without probing or disabling", async () => {
    const probeAccess = vi.fn();

    await expect(
      classifyPublicReportAccessFailure({
        result: {
          status: "rate_limited",
          messageCount: 1,
          sentMessageCount: 0,
          retryAfterMs: 2500,
          global: false,
          errorCategory: "RATE_LIMITED",
          httpStatus: 429,
          providerErrorCode: null,
        },
        settingFailureCount: 0,
        now: NOW,
        probeAccess,
      }),
    ).resolves.toEqual({
      kind: "retry",
      retryNotBefore: new Date("2026-07-23T10:00:02.500Z"),
      providerErrorCode: null,
    });
    expect(probeAccess).not.toHaveBeenCalled();
  });

  it.each([
    { httpStatus: null, errorCategory: "TRANSPORT" as const },
    { httpStatus: 503, errorCategory: "PROVIDER" as const },
  ])("backs off transient failure $httpStatus", async ({ httpStatus, errorCategory }) => {
    await expect(
      classifyPublicReportAccessFailure({
        result: {
          status: "failed",
          messageCount: 1,
          sentMessageCount: 0,
          errorCategory,
          httpStatus,
          providerErrorCode: null,
        },
        settingFailureCount: 1,
        now: NOW,
        probeAccess: async () => ({ status: "accessible" }),
      }),
    ).resolves.toEqual({
      kind: "retry",
      retryNotBefore: new Date("2026-07-23T10:15:00.000Z"),
      providerErrorCode: null,
    });
  });

  it.each([
    { httpStatus: 401, providerErrorCode: null },
    { httpStatus: 403, providerErrorCode: 50014 },
  ])(
    "aborts the cycle for a global authentication failure",
    async ({ httpStatus, providerErrorCode }) => {
      const probeAccess = vi.fn();

      await expect(
        classifyPublicReportAccessFailure({
          result: {
            status: "failed",
            messageCount: 1,
            sentMessageCount: 0,
            errorCategory: "PROVIDER",
            httpStatus,
            providerErrorCode,
          },
          settingFailureCount: 0,
          now: NOW,
          probeAccess,
        }),
      ).resolves.toEqual({
        kind: "abort",
        providerErrorCode,
      });
      expect(probeAccess).not.toHaveBeenCalled();
    },
  );
});

function failedResult(providerErrorCode: number) {
  return {
    status: "failed" as const,
    messageCount: 1,
    sentMessageCount: 0,
    errorCategory: "PERMISSIONS" as const,
    httpStatus: 403,
    providerErrorCode,
  };
}
