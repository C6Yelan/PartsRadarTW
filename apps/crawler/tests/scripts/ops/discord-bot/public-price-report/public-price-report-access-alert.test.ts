// 驗證公開報告自動停用告警只揭露 Discord id 尾碼與結構化 provider code。

import { expect, it, vi } from "vitest";
import { notifyPublicReportAccessDisabled } from "../../../../../src/scripts/ops/discord-bot/public-price-report/access-alert";

it("sends a safe administrator alert for an automatically disabled setting", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

  await notifyPublicReportAccessDisabled({
    webhookUrl: "https://discord.com/api/webhooks/123456/token",
    setting: {
      discordGuildId: "111111111111752645",
      channelId: "222222222222281671",
    },
    accessStatus: "DISABLED_BOT_REMOVED",
    providerErrorCode: 10004,
    fetchImpl: fetchMock,
    logMessage: vi.fn(),
  });

  const body = String(fetchMock.mock.calls[0]?.[1]?.body);

  expect(body).toContain("guild=...752645");
  expect(body).toContain("channel=...281671");
  expect(body).toContain("reason=BOT_REMOVED");
  expect(body).toContain("providerCode=10004");
  expect(body).not.toContain("111111111111752645");
  expect(body).not.toContain("222222222222281671");
});
