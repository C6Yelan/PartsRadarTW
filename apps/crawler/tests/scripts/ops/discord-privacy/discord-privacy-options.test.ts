// apps/crawler/tests/scripts/ops/discord-privacy/discord-privacy-options.test.ts
// 驗證 privacy CLI 的 verification gate、confirmation、DM failure 與輸出遮罩邊界。

import { resolveDiscordPublicReportPurgeAfter } from "@partsradar/db/discord-privacy";
import { describe, expect, it, vi } from "vitest";
import { parseDiscordPrivacyCommand } from "../../../../src/scripts/ops/discord-privacy/options";
import {
  maskDiscordId,
  runDiscordPrivacyCommand,
} from "../../../../src/scripts/ops/discord-privacy/runner";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";

describe("Discord privacy CLI options", () => {
  it("requires a verified request ID for user operations and keeps erase dry-run by default", () => {
    expect(parseDiscordPrivacyCommand(["inspect-user", "--request-id", REQUEST_ID])).toMatchObject({
      action: "inspect-user",
      requestId: REQUEST_ID,
    });
    expect(parseDiscordPrivacyCommand(["erase-user", "--request-id", REQUEST_ID])).toMatchObject({
      action: "erase-user",
      execute: false,
    });
    expect(
      parseDiscordPrivacyCommand(["erase-user", "--request-id", REQUEST_ID, "--confirm-erase"]),
    ).toMatchObject({ action: "erase-user", execute: true });
    expect(() =>
      parseDiscordPrivacyCommand(["inspect-user", "--discord-user-id", "111122223333444455"]),
    ).toThrow("--request-id is required");
  });

  it("validates verification request types, UUIDs and unknown flags", () => {
    expect(
      parseDiscordPrivacyCommand([
        "create-verification",
        "--request-type",
        "erase",
        "--discord-user-id",
        "111122223333444455",
      ]),
    ).toEqual({
      action: "create-verification",
      requestType: "ERASE",
      subjectId: "111122223333444455",
    });
    expect(() => parseDiscordPrivacyCommand(["verify-code", "--request-id", "not-a-uuid"])).toThrow(
      "must be a UUID",
    );
    expect(() => parseDiscordPrivacyCommand(["cleanup", "--confirm-cleanup", "--force"])).toThrow(
      "Unknown Discord privacy option",
    );
  });

  it("cancels the request when Discord DM delivery fails", async () => {
    const create = vi.fn().mockResolvedValue({ id: REQUEST_ID });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      discordPrivacyVerificationRequest: { create, updateMany },
    };

    await expect(
      runDiscordPrivacyCommand({
        client: client as never,
        command: {
          action: "create-verification",
          requestType: "INSPECT",
          subjectId: "111122223333444455",
        },
        now: new Date("2030-01-01T00:00:00.000Z"),
        sendVerificationDm: vi.fn().mockResolvedValue({
          status: "failed",
          messageCount: 1,
          sentMessageCount: 0,
          httpStatus: 403,
          errorCategory: "DM_UNAVAILABLE",
          providerErrorCode: 50007,
        }),
      }),
    ).rejects.toThrow("Discord verification DM could not be delivered");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: REQUEST_ID }),
        data: { cancelledAt: new Date("2030-01-01T00:00:00.000Z") },
      }),
    );
    const storedDigest = create.mock.calls[0]?.[0]?.data?.codeDigest;
    expect(storedDigest).toMatch(/^scrypt\$/);
  });

  it("sends only the case metadata, short code, expiry and ignore notice in the DM", async () => {
    const create = vi.fn().mockResolvedValue({ id: REQUEST_ID });
    const sendVerificationDm = vi.fn().mockResolvedValue({
      status: "sent",
      messageCount: 1,
      httpStatuses: [200],
    });
    const result = await runDiscordPrivacyCommand({
      client: {
        discordPrivacyVerificationRequest: { create },
      } as never,
      command: {
        action: "create-verification",
        requestType: "ERASE",
        subjectId: "111122223333444455",
      },
      now: new Date("2030-01-01T00:00:00.000Z"),
      sendVerificationDm,
    });
    const dmText = sendVerificationDm.mock.calls[0]?.[1]?.[0]?.content ?? "";
    const code = dmText.match(/驗證碼：(\d{8})/)?.[1];

    expect(dmText).toContain(`案件編號：${REQUEST_ID}`);
    expect(dmText).toContain("資料刪除");
    expect(dmText).toContain("2030-01-01T00:30:00.000Z");
    expect(dmText).toContain("若非本人提出申請，請忽略本訊息");
    expect(dmText).not.toContain("111122223333444455");
    expect(code).toMatch(/^\d{8}$/);
    expect(create.mock.calls[0]?.[0]?.data?.codeDigest).not.toContain(code);
    expect(JSON.stringify(result)).not.toContain(code);
  });

  it("does not query personal data for an unconfirmed erase dry-run", async () => {
    const result = await runDiscordPrivacyCommand({
      client: {} as never,
      command: { action: "erase-user", requestId: REQUEST_ID, execute: false },
    });

    expect(result).toEqual({
      action: "erase-user",
      requestId: REQUEST_ID,
      dryRun: true,
      message: "No personal data was queried or deleted.",
    });
  });

  it("never returns the complete Discord identifier for output", () => {
    const id = "111122223333444455";
    const masked = maskDiscordId(id);

    expect(masked).toBe("11…55");
    expect(masked).not.toContain(id);
  });

  it("uses 30-day permission and 60-day removed-resource purge windows", () => {
    const disabledAt = new Date("2030-01-01T00:00:00.000Z");

    expect(
      resolveDiscordPublicReportPurgeAfter({
        accessStatus: "PAUSED_PERMISSION",
        disabledAt,
      }),
    ).toEqual(new Date("2030-01-31T00:00:00.000Z"));
    expect(
      resolveDiscordPublicReportPurgeAfter({
        accessStatus: "DISABLED_CHANNEL_GONE",
        disabledAt,
      }),
    ).toEqual(new Date("2030-03-02T00:00:00.000Z"));
  });
});
