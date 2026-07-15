// 驗證 guild 管理員限定 /status 的排程摘要、查詢隔離與 ephemeral 回覆。

import { describe, expect, it, vi } from "vitest";
import {
  createStatusMessage,
  handleStatusInteraction,
} from "../../../../../src/scripts/ops/discord-bot/interactions/status";
import { createDiscordBotSchedulerStatusStore } from "../../../../../src/scripts/ops/discord-bot/scheduler-status";
import type {
  DiscordBotClient,
  DiscordInteraction,
} from "../../../../../src/scripts/ops/discord-bot/types";
import { createDiscordBotOptions } from "../support";

const NOW = new Date("2026-07-15T04:48:00.000Z");

describe("status interaction", () => {
  it("requires Manage Guild at runtime and does not query schedule data when denied", async () => {
    const client = createStatusClient();
    const fetchMock = interactionFetch();

    await handleStatusInteraction({
      client,
      interaction: statusInteraction("0"),
      options: createDiscordBotOptions(),
      fetchImpl: fetchMock,
      schedulerStatus: populatedSchedulerStatus(),
      now: NOW,
    });

    expect(client.crawlRun.findMany).not.toHaveBeenCalled();
    expect(client.discordTargetPriceWatch.count).not.toHaveBeenCalled();
    const body = responseBody(fetchMock);
    expect(body).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(body.data.content).toBe("你沒有使用這個指令的權限。");
    expect(body.data.embeds).toBeUndefined();
  });

  it("returns only the five requested schedule fields in an ephemeral embed", async () => {
    const client = createStatusClient();
    const fetchMock = interactionFetch();

    await handleStatusInteraction({
      client,
      interaction: statusInteraction("32"),
      options: createDiscordBotOptions(),
      fetchImpl: fetchMock,
      schedulerStatus: populatedSchedulerStatus(),
      now: NOW,
    });

    const body = responseBody(fetchMock);
    const embed = body.data.embeds[0];
    expect(body).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(body.data.embeds).toHaveLength(1);
    expect(embed).toMatchObject({
      title: "PartsRadarTW 排程狀態",
      description: "管理員用排程與背景工作摘要。時間皆為台北時間。",
      timestamp: NOW.toISOString(),
    });
    expect(embed.fields).toHaveLength(5);
    expect(embed.fields.map((field: { name: string }) => field.name)).toEqual([
      "商品價格爬蟲",
      "Discord 通知排程主迴圈",
      "目標價提醒掃描",
      "個人價格報告排程",
      "公開價格報告排程",
    ]);
    expect(
      embed.fields.every((field: { inline?: boolean }) => field.inline === true),
    ).toBe(true);
    expect(JSON.stringify(embed)).not.toMatch(/機器人|Gateway|uptime|已運作|資料範圍/);
    expect(JSON.stringify(embed)).not.toContain('"name":"功能"');
  });

  it.each([
    ["SUCCESS_CHANGED", "完成，有價格或商品更新"],
    ["SUCCESS_UNCHANGED", "完成，沒有價格變動"],
    ["SUCCESS_WITH_ERRORS", "完成，但部分分類需要注意"],
    ["FETCH_FAILED", "更新失敗"],
    ["SUSPECTED_BLOCK", "來源網站暫時無法正常讀取"],
    ["PARSE_FAILED", "部分商品資料無法整理"],
  ])("shows human text and the technical crawler enum for %s", async (status, expectedText) => {
    const message = await createStatusMessage({
      client: createStatusClient({ runs: [crawlRun(status), previousCrawlRun()] }),
      options: createDiscordBotOptions(),
      schedulerStatus: populatedSchedulerStatus(),
      now: NOW,
    });
    const crawler = fieldValue(message, "商品價格爬蟲");

    expect(crawler).toContain(expectedText);
    expect(crawler).toContain(`\`${status}\``);
  });

  it("shows a running duration without treating the run as failed", async () => {
    const message = await createStatusMessage({
      client: createStatusClient({ runs: [crawlRun("RUNNING"), previousCrawlRun()] }),
      options: createDiscordBotOptions(),
      schedulerStatus: populatedSchedulerStatus(),
      now: NOW,
    });
    const crawler = fieldValue(message, "商品價格爬蟲");

    expect(crawler).toContain("狀態：RUNNING · 正在更新");
    expect(crawler).toContain("代碼：`RUNNING`");
    expect(crawler).toContain("執行：07/15 12:00:00 起（已執行 48 分）");
    expect(crawler).toContain("最近成功：07/15 12:20:00");
  });

  it("uses warning severity for a crawler run completed with partial errors", async () => {
    const message = await createStatusMessage({
      client: createStatusClient({
        runs: [crawlRun("SUCCESS_WITH_ERRORS"), previousCrawlRun()],
      }),
      options: createDiscordBotOptions(),
      schedulerStatus: healthySchedulerStatus(),
      now: NOW,
    });

    expect(message.embeds?.[0]?.color).toBe(0xeab308);
  });

  it("shows active backoff and its end time", async () => {
    const run = crawlRun("SUCCESS_UNCHANGED");
    run.backoffUntil = new Date("2026-07-15T05:18:00.000Z");
    const message = await createStatusMessage({
      client: createStatusClient({ runs: [run, previousCrawlRun()] }),
      options: createDiscordBotOptions(),
      schedulerStatus: populatedSchedulerStatus(),
      now: NOW,
    });
    const crawler = fieldValue(message, "商品價格爬蟲");

    expect(crawler).toContain("狀態：BACKOFF · 完成，沒有價格變動");
    expect(crawler).toContain("Backoff 至：07/15 13:18:00");
  });

  it("calculates start-to-start interval from the latest two scheduled runs", async () => {
    const message = await createStatusMessage({
      client: createStatusClient(),
      options: createDiscordBotOptions(),
      schedulerStatus: populatedSchedulerStatus(),
      now: NOW,
    });

    expect(fieldValue(message, "商品價格爬蟲")).toContain("間隔：1 小時");
  });

  it("uses a safe observed-interval fallback with only one run", async () => {
    const message = await createStatusMessage({
      client: createStatusClient({ runs: [crawlRun("SUCCESS_UNCHANGED")] }),
      options: createDiscordBotOptions(),
      schedulerStatus: populatedSchedulerStatus(),
      now: NOW,
    });

    expect(fieldValue(message, "商品價格爬蟲")).toContain("間隔：尚無足夠資料");
  });

  it("shows NOT_RUN before the notification loop completes its first cycle", async () => {
    const message = await createStatusMessage({
      client: createStatusClient(),
      options: createDiscordBotOptions(),
      now: NOW,
    });

    expect(fieldValue(message, "Discord 通知排程主迴圈")).toContain(
      "上次：尚未完成第一輪 · `NOT_RUN`",
    );
  });

  it("compacts healthy schedule details without losing technical outcomes", async () => {
    const message = await createStatusMessage({
      client: createStatusClient({
        activeWatchCount: 1,
        enabledPersonalCount: 1,
        dueCount: 0,
        earliestNextSendAt: new Date("2026-07-16T01:00:00.000Z"),
      }),
      options: createDiscordBotOptions(),
      schedulerStatus: healthySchedulerStatus(),
      now: NOW,
    });
    const crawler = fieldValue(message, "商品價格爬蟲");
    const loop = fieldValue(message, "Discord 通知排程主迴圈");
    const target = fieldValue(message, "目標價提醒掃描");
    const personal = fieldValue(message, "個人價格報告排程");
    const publicReport = fieldValue(message, "公開價格報告排程");
    const allFields = message.embeds?.[0]?.fields?.map((field) => field.value).join("\n") ?? "";

    expect(crawler).toContain("狀態：IDLE · 完成，沒有價格變動");
    expect(crawler).toContain("代碼：`SUCCESS_UNCHANGED`");
    expect(crawler).toContain("執行：07/15 12:00:00 → 12:20:00（20 分）");
    expect(crawler).not.toContain("最近成功");
    expect(loop).toContain("上次：07/15 12:40:03 · `OK` · 3 秒");
    expect(loop).toContain("下次：07/15 12:45:03");
    expect(loop).toContain("週期：5 分鐘");
    expect(target).toContain("結果：`OK`");
    expect(target).toContain("啟用提醒：1");
    expect(target).toContain("掃描／到期／處理／送出：0／0／0／0");
    expect(personal).toContain("設定／到期：1／0");
    expect(personal).toContain("下次送出：07/16 09:00");
    expect(personal).toContain("處理／送出：0／0");
    expect(publicReport).toContain("設定／處理：2／2");
    expect(publicReport).toContain("送出／略過：1／1");
    expect(publicReport).not.toContain("啟用設定");
    expect(allFields).not.toMatch(/功能：`ENABLED`|Backoff：無|限流／失敗：0／0/);
    expect(allFields).not.toMatch(/上次掃描|上次開始|上次完成|下次掃描|掃描間隔/);
    expect(allFields).not.toMatch(/undefined|null|Invalid Date/);
  });

  it("shows disabled schedules and nonzero anomaly counts only when needed", async () => {
    const schedulerStatus = populatedSchedulerStatus();
    schedulerStatus.recordPublicReports({
      startedAt: new Date("2026-07-15T04:40:00.000Z"),
      completedAt: new Date("2026-07-15T04:40:03.000Z"),
      outcome: "OK",
      settingCount: 2,
      processedCount: 2,
      sentCount: 1,
      skippedCount: 1,
      rateLimitedCount: 1,
      failedCount: 2,
    });
    const message = await createStatusMessage({
      client: createStatusClient({ enabledPublicCount: 4 }),
      options: createDiscordBotOptions({
        targetWatchesEnabled: false,
        personalReportsEnabled: false,
        publicReportsEnabled: false,
      }),
      schedulerStatus,
      now: NOW,
    });

    expect(fieldValue(message, "目標價提醒掃描")).toMatch(
      /功能：`DISABLED`[\s\S]*限流／失敗：0／1/,
    );
    expect(fieldValue(message, "個人價格報告排程")).toMatch(
      /功能：`DISABLED`[\s\S]*限流／失敗：1／0/,
    );
    expect(fieldValue(message, "公開價格報告排程")).toMatch(
      /功能：`DISABLED`[\s\S]*設定／處理：2／2[\s\S]*啟用設定：4[\s\S]*限流／失敗：1／2/,
    );
  });

  it("shows a safe scheduler error kind without raw errors", async () => {
    const schedulerStatus = populatedSchedulerStatus();
    schedulerStatus.recordTargetPrice({
      startedAt: new Date("2026-07-15T04:40:00.000Z"),
      completedAt: new Date("2026-07-15T04:40:03.000Z"),
      outcome: "ERROR",
      errorKind: "SCAN_ERROR",
      scannedCount: 0,
      dueCount: 0,
      processedCount: 0,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });
    const message = await createStatusMessage({
      client: createStatusClient(),
      options: createDiscordBotOptions(),
      schedulerStatus,
      now: NOW,
    });

    expect(fieldValue(message, "目標價提醒掃描")).toContain("結果：`ERROR`");
    expect(fieldValue(message, "目標價提醒掃描")).toContain("錯誤：SCAN_ERROR");
  });

  it.each(["crawler", "target", "personal", "public"] as const)(
    "isolates a rejected %s query and never exposes its raw error",
    async (rejectArea) => {
      const message = await createStatusMessage({
        client: createStatusClient({ rejectArea }),
        options: createDiscordBotOptions(),
        schedulerStatus: populatedSchedulerStatus(),
        now: NOW,
      });
      const text = JSON.stringify(message);

      expect(message.embeds?.[0]?.fields).toHaveLength(5);
      expect(text).toContain("QUERY_ERROR");
      expect(text).not.toContain("postgresql://private");
      expect(text).not.toContain("DATABASE_URL");
      expect(text).not.toMatch(/hostname|process PID|private stack/);
    },
  );
});

function createStatusClient({
  runs = [crawlRun("SUCCESS_UNCHANGED"), previousCrawlRun()],
  activeWatchCount = 2,
  enabledPersonalCount = 3,
  dueCount = 1,
  earliestNextSendAt = new Date("2026-07-15T05:00:00.000Z"),
  enabledPublicCount = 2,
  rejectArea = null,
}: {
  runs?: ReturnType<typeof crawlRun>[];
  activeWatchCount?: number;
  enabledPersonalCount?: number;
  dueCount?: number;
  earliestNextSendAt?: Date | null;
  enabledPublicCount?: number;
  rejectArea?: "crawler" | "target" | "personal" | "public" | null;
} = {}) {
  const rejection = new Error(
    "DATABASE_URL=postgresql://private host=secret-container private stack",
  );
  const rejectIf = (area: NonNullable<typeof rejectArea>) => {
    if (rejectArea === area) throw rejection;
  };

  return {
    crawlRun: {
      findMany: vi.fn(async () => {
        rejectIf("crawler");
        return runs;
      }),
      findFirst: vi.fn(async () => {
        rejectIf("crawler");
        return { finishedAt: new Date("2026-07-15T04:20:00.000Z") };
      }),
    },
    discordTargetPriceWatch: {
      count: vi.fn(async () => {
        rejectIf("target");
        return activeWatchCount;
      }),
    },
    discordPriceReportSetting: {
      count: vi.fn(async (args: { where?: { nextSendAt?: unknown } }) => {
        rejectIf("personal");
        return args.where?.nextSendAt ? dueCount : enabledPersonalCount;
      }),
      findFirst: vi.fn(async () => {
        rejectIf("personal");
        return earliestNextSendAt ? { nextSendAt: earliestNextSendAt } : null;
      }),
    },
    discordPublicPriceReportSetting: {
      count: vi.fn(async () => {
        rejectIf("public");
        return enabledPublicCount;
      }),
    },
  } as unknown as Pick<
    DiscordBotClient,
    | "crawlRun"
    | "discordTargetPriceWatch"
    | "discordPriceReportSetting"
    | "discordPublicPriceReportSetting"
  > & {
    crawlRun: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    discordTargetPriceWatch: { count: ReturnType<typeof vi.fn> };
  };
}

function populatedSchedulerStatus() {
  const store = createDiscordBotSchedulerStatusStore();
  const startedAt = new Date("2026-07-15T04:40:00.000Z");
  const completedAt = new Date("2026-07-15T04:40:03.000Z");

  store.recordNotificationLoop({
    startedAt,
    completedAt,
    outcome: "OK",
    nextRunAt: new Date("2026-07-15T04:45:03.000Z"),
  });
  store.recordTargetPrice({
    startedAt,
    completedAt,
    outcome: "OK",
    nextRunAt: new Date("2026-07-15T04:45:00.000Z"),
    scannedCount: 8,
    dueCount: 5,
    processedCount: 5,
    sentCount: 4,
    rateLimitedCount: 0,
    failedCount: 1,
  });
  store.recordPersonalReports({
    startedAt,
    completedAt,
    outcome: "OK",
    nextRunAt: new Date("2026-07-15T05:00:00.000Z"),
    processedCount: 3,
    sentCount: 2,
    rateLimitedCount: 1,
    failedCount: 0,
  });
  store.recordPublicReports({
    startedAt,
    completedAt,
    outcome: "OK",
    settingCount: 2,
    processedCount: 2,
    sentCount: 1,
    skippedCount: 1,
    rateLimitedCount: 0,
    failedCount: 0,
  });

  return store;
}

function healthySchedulerStatus() {
  const store = populatedSchedulerStatus();
  const startedAt = new Date("2026-07-15T04:40:00.000Z");
  const completedAt = new Date("2026-07-15T04:40:03.000Z");

  store.recordTargetPrice({
    startedAt,
    completedAt,
    outcome: "OK",
    scannedCount: 0,
    dueCount: 0,
    processedCount: 0,
    sentCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  });
  store.recordPersonalReports({
    startedAt,
    completedAt,
    outcome: "OK",
    processedCount: 0,
    sentCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  });

  return store;
}

function crawlRun(status: string) {
  return {
    status,
    startedAt: new Date("2026-07-15T04:00:00.000Z"),
    finishedAt: status === "RUNNING" ? null : new Date("2026-07-15T04:20:00.000Z"),
    backoffUntil: null as Date | null,
    categoryResults: [
      { status: "SUCCESS_CHANGED" },
      { status: status === "SUCCESS_WITH_ERRORS" ? "FETCH_FAILED" : "SUCCESS_UNCHANGED" },
    ],
  };
}

function previousCrawlRun() {
  return {
    ...crawlRun("SUCCESS_UNCHANGED"),
    startedAt: new Date("2026-07-15T03:00:00.000Z"),
    finishedAt: new Date("2026-07-15T03:20:00.000Z"),
  };
}

function fieldValue(message: Awaited<ReturnType<typeof createStatusMessage>>, name: string): string {
  return message.embeds?.[0]?.fields?.find((field) => field.name === name)?.value ?? "";
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
