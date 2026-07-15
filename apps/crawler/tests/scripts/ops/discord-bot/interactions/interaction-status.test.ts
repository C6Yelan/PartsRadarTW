// apps/crawler/tests/scripts/ops/discord-bot/interactions/interaction-status.test.ts
// 驗證 guild 管理員限定 /status 的安全查詢、狀態文案與 ephemeral 回覆。

import { describe, expect, it, vi } from "vitest";
import {
  createStatusMessage,
  handleStatusInteraction,
} from "../../../../../src/scripts/ops/discord-bot/interactions/status";
import type {
  DiscordBotClient,
  DiscordInteraction,
} from "../../../../../src/scripts/ops/discord-bot/types";
import { createDiscordBotOptions } from "../support";

const NOW = new Date("2026-07-15T04:48:00.000Z");

describe("status interaction", () => {
  it("requires Manage Guild at runtime and does not query status data when denied", async () => {
    const client = createStatusClient();
    const fetchMock = interactionFetch();

    await handleStatusInteraction({
      client,
      interaction: statusInteraction("0"),
      options: createDiscordBotOptions(),
      fetchImpl: fetchMock,
      now: NOW,
      uptimeSeconds: 3723,
    });

    expect(client.crawlRun.findFirst).not.toHaveBeenCalled();
    expect(client.sourceCategory.count).not.toHaveBeenCalled();
    const body = responseBody(fetchMock);
    expect(body).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(body.data.content).toBe("你沒有使用這個指令的權限。");
    expect(body.data.embeds).toBeUndefined();
  });

  it("returns an ephemeral status embed with a fake timestamp and uptime", async () => {
    const client = createStatusClient({
      run: crawlRun("SUCCESS_CHANGED"),
      enabledCategoryCount: 21,
      oldestLastSuccessAt: new Date("2026-07-15T03:30:00.000Z"),
    });
    const fetchMock = interactionFetch();

    await handleStatusInteraction({
      client,
      interaction: statusInteraction("32"),
      options: createDiscordBotOptions(),
      fetchImpl: fetchMock,
      now: NOW,
      uptimeSeconds: 3723,
    });

    const body = responseBody(fetchMock);
    expect(body).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(body.data.embeds[0]).toMatchObject({
      title: "PartsRadarTW 系統狀態",
      description: "目前機器人與商品資料更新概況。",
      timestamp: NOW.toISOString(),
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: "機器人",
          value: expect.stringContaining("1 小時 2 分鐘"),
        }),
        expect.objectContaining({ name: "商品資料更新", value: expect.stringContaining("正常") }),
        expect.objectContaining({
          name: "最近一次爬取",
          value: expect.stringContaining("完成，有價格或商品更新"),
        }),
        expect.objectContaining({ name: "資料範圍", value: expect.stringContaining("21") }),
      ]),
    });
    expect(client.crawlRun.findFirst).toHaveBeenCalledWith({
      where: { triggerType: "SCHEDULED" },
      orderBy: { startedAt: "desc" },
      select: {
        status: true,
        startedAt: true,
        finishedAt: true,
        backoffUntil: true,
        categoryResults: { select: { status: true } },
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /errorMessage|rawSnapshot|parseError|hostname|process PID|DATABASE_URL/,
    );
  });

  it.each([
    ["RUNNING", "正在更新"],
    ["SUCCESS_CHANGED", "完成，有價格或商品更新"],
    ["SUCCESS_UNCHANGED", "完成，沒有新的價格變動"],
    ["SUCCESS_WITH_ERRORS", "完成，但部分分類需要注意"],
    ["FETCH_FAILED", "更新失敗"],
    ["SUSPECTED_BLOCK", "來源網站暫時無法正常讀取"],
    ["PARSE_FAILED", "部分商品資料無法整理"],
  ])("maps %s to safe user-facing text", async (status, expectedText) => {
    const message = await createStatusMessage({
      client: createStatusClient({ run: crawlRun(status) }),
      options: createDiscordBotOptions(),
      now: NOW,
      uptimeSeconds: 60,
    });
    const serialized = JSON.stringify(message);

    expect(serialized).toContain(expectedText);
    expect(serialized).not.toContain(`"${status}"`);
  });

  it("handles missing runs, no enabled categories, and null category update times", async () => {
    const message = await createStatusMessage({
      client: createStatusClient({
        run: null,
        enabledCategoryCount: 0,
        missingSuccessCount: 0,
        oldestLastSuccessAt: null,
      }),
      options: createDiscordBotOptions(),
      now: NOW,
      uptimeSeconds: 0,
    });
    const text = JSON.stringify(message);

    expect(text).toContain("尚無排程更新紀錄");
    expect(text).toContain("已啟用分類：0");
    expect(text).toContain("最近最舊分類更新：尚無資料");
  });

  it("reports categories without a successful update", async () => {
    const message = await createStatusMessage({
      client: createStatusClient({ missingSuccessCount: 3, oldestLastSuccessAt: null }),
      options: createDiscordBotOptions(),
      now: NOW,
      uptimeSeconds: 60,
    });

    expect(JSON.stringify(message)).toContain("尚無成功更新紀錄：3 個分類");
  });

  it("keeps bot status available and does not leak a rejected DB error", async () => {
    const message = await createStatusMessage({
      client: createStatusClient({ reject: true }),
      options: createDiscordBotOptions(),
      now: NOW,
      uptimeSeconds: 60,
    });
    const text = JSON.stringify(message);

    expect(text).toContain("🟢 運作正常");
    expect(text).toContain("目前無法讀取資料更新狀態");
    expect(text).not.toContain("postgresql://private");
    expect(text).not.toContain("DATABASE_URL");
  });
});

function createStatusClient({
  run = crawlRun("SUCCESS_UNCHANGED"),
  enabledCategoryCount = 2,
  missingSuccessCount = 0,
  oldestLastSuccessAt = new Date("2026-07-15T03:30:00.000Z"),
  reject = false,
}: {
  run?: ReturnType<typeof crawlRun> | null;
  enabledCategoryCount?: number;
  missingSuccessCount?: number;
  oldestLastSuccessAt?: Date | null;
  reject?: boolean;
} = {}) {
  const rejection = new Error("DATABASE_URL=postgresql://private host=secret-container");
  const count = vi
    .fn()
    .mockImplementationOnce(async () => {
      if (reject) throw rejection;
      return enabledCategoryCount;
    })
    .mockImplementationOnce(async () => {
      if (reject) throw rejection;
      return missingSuccessCount;
    });

  return {
    crawlRun: {
      findFirst: vi.fn(async () => {
        if (reject) throw rejection;
        return run;
      }),
    },
    sourceCategory: {
      count,
      findFirst: vi.fn(async () => {
        if (reject) throw rejection;
        return oldestLastSuccessAt ? { lastSuccessAt: oldestLastSuccessAt } : null;
      }),
    },
  } as unknown as Pick<DiscordBotClient, "crawlRun" | "sourceCategory"> & {
    crawlRun: { findFirst: ReturnType<typeof vi.fn> };
    sourceCategory: { count: ReturnType<typeof vi.fn> };
  };
}

function crawlRun(status: string) {
  return {
    status,
    startedAt: new Date("2026-07-15T04:00:00.000Z"),
    finishedAt: status === "RUNNING" ? null : new Date("2026-07-15T04:20:00.000Z"),
    backoffUntil: null,
    categoryResults: [
      { status: "SUCCESS_CHANGED" },
      { status: status === "SUCCESS_WITH_ERRORS" ? "FETCH_FAILED" : "SUCCESS_UNCHANGED" },
    ],
  };
}

function statusInteraction(permissions: string): DiscordInteraction {
  return {
    id: "status-interaction",
    token: "interaction-token",
    type: 2,
    guild_id: "guild-1",
    channel_id: "channel-1",
    data: { name: "status" },
    member: { permissions, user: { id: "admin-user" } },
  };
}

function interactionFetch() {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
  );
}

function responseBody(fetchMock: ReturnType<typeof interactionFetch>) {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
}
