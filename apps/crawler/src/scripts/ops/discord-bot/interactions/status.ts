// apps/crawler/src/scripts/ops/discord-bot/interactions/status.ts
// 建立管理員限定的排程與背景工作狀態面板，不暴露原始錯誤或執行環境資訊。

import {
  DISCORD_PERMISSION_MANAGE_GUILD,
  DISCORD_TARGET_PRICE_REACHED_COLOR,
  TIME_ZONE,
} from "../constants";
import { sendInteractionResponse } from "../rest";
import {
  createEmptyDiscordBotSchedulerStatusSnapshot,
  type DiscordBotSchedulerStatusReader,
  type DiscordBotSchedulerStatusSnapshot,
  type ScheduleExecutionState,
} from "../scheduler-status";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotOptions,
  DiscordInteraction,
  FetchImpl,
} from "../types";

const DISCORD_STATUS_WARNING_COLOR = 0xeab308;
const DISCORD_STATUS_ERROR_COLOR = 0xdc2626;

type StatusClient = Pick<
  DiscordBotClient,
  | "crawlRun"
  | "discordPriceReportSetting"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
>;

type StatusSeverity = "normal" | "warning" | "error";

interface CrawlerRunRecord {
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  backoffUntil: Date | null;
  categoryResults: Array<{ status: string }>;
}

export async function handleStatusInteraction({
  client,
  interaction,
  options,
  fetchImpl,
  schedulerStatus,
  now = new Date(),
}: {
  client: StatusClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  schedulerStatus?: DiscordBotSchedulerStatusReader;
  now?: Date;
}): Promise<void> {
  if (!hasManageGuildPermission(interaction)) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: "你沒有使用這個指令的權限。",
    });
    return;
  }

  const message = await createStatusMessage({ client, options, schedulerStatus, now });

  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    message,
  });
}

export async function createStatusMessage({
  client,
  options,
  schedulerStatus,
  now = new Date(),
}: {
  client: StatusClient;
  options: Pick<
    DiscordBotOptions,
    | "personalReportsEnabled"
    | "priceReportScheduleIntervalSeconds"
    | "publicReportsEnabled"
    | "targetWatchesEnabled"
  >;
  schedulerStatus?: DiscordBotSchedulerStatusReader;
  now?: Date;
}): Promise<DiscordBotMessage> {
  const runtime =
    schedulerStatus?.getSnapshot() ?? createEmptyDiscordBotSchedulerStatusSnapshot();
  const [crawlerResult, targetCountResult, personalResult, publicResult] =
    await Promise.allSettled([
      readCrawlerStatus(client),
      client.discordTargetPriceWatch.count({ where: { enabled: true } }),
      readPersonalReportDatabaseStatus(client, now),
      client.discordPublicPriceReportSetting.count({ where: { enabled: true } }),
    ]);
  const crawler = crawlerResult.status === "fulfilled" ? crawlerResult.value : null;
  const activeWatchCount = targetCountResult.status === "fulfilled" ? targetCountResult.value : null;
  const personal = personalResult.status === "fulfilled" ? personalResult.value : null;
  const enabledPublicSettingCount =
    publicResult.status === "fulfilled" ? publicResult.value : null;
  const severity = resolveOverallSeverity({
    crawlerRuns: crawler?.runs ?? null,
    runtime,
    enabledSchedules: {
      targetPrice: options.targetWatchesEnabled,
      personalReports: options.personalReportsEnabled,
      publicReports: options.publicReportsEnabled,
    },
    queryFailed: [crawlerResult, targetCountResult, personalResult, publicResult].some(
      (result) => result.status === "rejected",
    ),
    now,
  });
  const scanIntervalMs = options.priceReportScheduleIntervalSeconds * 1000;

  return {
    embeds: [
      {
        title: "PartsRadarTW 排程狀態",
        description: "管理員用排程與背景工作摘要。時間皆為台北時間。",
        color: severityColor(severity),
        timestamp: now.toISOString(),
        fields: [
          {
            name: "商品價格爬蟲",
            value: formatCrawlerStatus(crawler, now),
          },
          {
            name: "Discord 通知排程主迴圈",
            value: formatNotificationLoop(runtime.notificationLoop, scanIntervalMs),
          },
          {
            name: "目標價提醒掃描",
            value: formatTargetPriceStatus({
              state: runtime.targetPrice,
              enabled: options.targetWatchesEnabled,
              scanIntervalMs,
              activeWatchCount,
            }),
          },
          {
            name: "個人價格報告排程",
            value: formatPersonalReportStatus({
              state: runtime.personalReports,
              enabled: options.personalReportsEnabled,
              databaseStatus: personal,
            }),
          },
          {
            name: "公開價格報告排程",
            value: formatPublicReportStatus({
              state: runtime.publicReports,
              enabled: options.publicReportsEnabled,
              enabledSettingCount: enabledPublicSettingCount,
              nextRunAt: runtime.notificationLoop.nextRunAt,
            }),
          },
        ],
      },
    ],
  };
}

async function readCrawlerStatus(client: StatusClient): Promise<{
  runs: CrawlerRunRecord[];
  latestSuccessfulFinishedAt: Date | null;
}> {
  const runSelect = {
    status: true,
    startedAt: true,
    finishedAt: true,
    backoffUntil: true,
    categoryResults: { select: { status: true } },
  } as const;
  const [runs, latestSuccessfulRun] = await Promise.all([
    client.crawlRun.findMany({
      where: { triggerType: "SCHEDULED" },
      orderBy: { startedAt: "desc" },
      take: 2,
      select: runSelect,
    }),
    client.crawlRun.findFirst({
      where: {
        triggerType: "SCHEDULED",
        status: { in: ["SUCCESS_CHANGED", "SUCCESS_UNCHANGED"] },
        finishedAt: { not: null },
      },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  return {
    runs,
    latestSuccessfulFinishedAt: latestSuccessfulRun?.finishedAt ?? null,
  };
}

async function readPersonalReportDatabaseStatus(client: StatusClient, now: Date): Promise<{
  enabledCount: number;
  dueCount: number;
  earliestNextSendAt: Date | null;
}> {
  const [enabledCount, dueCount, earliestSetting] = await Promise.all([
    client.discordPriceReportSetting.count({ where: { enabled: true } }),
    client.discordPriceReportSetting.count({
      where: { enabled: true, nextSendAt: { lte: now } },
    }),
    client.discordPriceReportSetting.findFirst({
      where: { enabled: true, nextSendAt: { not: null } },
      orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
      select: { nextSendAt: true },
    }),
  ]);

  return {
    enabledCount,
    dueCount,
    earliestNextSendAt: earliestSetting?.nextSendAt ?? null,
  };
}

function formatCrawlerStatus(
  status: { runs: CrawlerRunRecord[]; latestSuccessfulFinishedAt: Date | null } | null,
  now: Date,
): string {
  if (!status) return "QUERY_ERROR｜目前無法讀取";

  const latestRun = status.runs[0];
  if (!latestRun) return "排程狀態：尚無排程執行紀錄";

  const runSummary = summarizeCrawlerRun(latestRun.status);
  const finishedAt = latestRun.finishedAt;
  const durationEnd = finishedAt ?? now;
  const observedInterval = status.runs[1]
    ? formatDuration(latestRun.startedAt.getTime() - status.runs[1].startedAt.getTime())
    : "尚無足夠資料";
  const successCount = latestRun.categoryResults.filter((result) =>
    result.status.startsWith("SUCCESS_"),
  ).length;
  const failedCount = latestRun.categoryResults.length - successCount;
  const backingOff = latestRun.backoffUntil !== null && latestRun.backoffUntil > now;

  return [
    `排程狀態：${backingOff ? "BACKOFF" : latestRun.status === "RUNNING" ? "RUNNING" : "IDLE"}`,
    `狀態：${runSummary}（\`${formatKnownCrawlerStatus(latestRun.status)}\`）`,
    `開始：${formatOptionalTime(latestRun.startedAt)}`,
    `完成：${finishedAt ? formatOptionalTime(finishedAt) : "執行中"}`,
    `${finishedAt ? "耗時" : "已執行"}：${formatDuration(durationEnd.getTime() - latestRun.startedAt.getTime())}`,
    `觀測間隔：${observedInterval}`,
    `成功／失敗分類：${successCount}／${failedCount}`,
    `Backoff：${backingOff ? `進行中，至 ${formatOptionalTime(latestRun.backoffUntil)}` : "無"}`,
    `最近成功完成：${formatOptionalTime(status.latestSuccessfulFinishedAt)}`,
  ].join("\n");
}

function formatNotificationLoop(state: ScheduleExecutionState, scanIntervalMs: number): string {
  if (state.lastOutcome === "NOT_RUN") {
    return [
      "狀態：尚未完成第一輪（`NOT_RUN`）",
      `下次喚醒：${formatOptionalTime(state.nextRunAt)}`,
      `掃描間隔：${formatDuration(scanIntervalMs)}`,
    ].join("\n");
  }

  return [
    `最後一輪開始：${formatOptionalTime(state.lastStartedAt)}`,
    `最後一輪完成：${formatOptionalTime(state.lastCompletedAt)}`,
    `耗時：${formatOptionalDuration(state.lastDurationMs)}`,
    `結果：${formatScheduleOutcome(state)}`,
    `下次喚醒：${formatOptionalTime(state.nextRunAt)}`,
    `掃描間隔：${formatDuration(scanIntervalMs)}`,
  ].join("\n");
}

function formatTargetPriceStatus({
  state,
  enabled,
  scanIntervalMs,
  activeWatchCount,
}: {
  state: DiscordBotSchedulerStatusSnapshot["targetPrice"];
  enabled: boolean;
  scanIntervalMs: number;
  activeWatchCount: number | null;
}): string {
  return [
    `功能：${enabled ? "ENABLED" : "DISABLED"}`,
    `掃描間隔：${formatDuration(scanIntervalMs)}`,
    `上次開始：${formatOptionalTime(state.lastStartedAt)}`,
    `上次完成：${formatOptionalTime(state.lastCompletedAt)}`,
    `下次掃描：${formatOptionalTime(state.nextRunAt)}`,
    `結果：${formatScheduleOutcome(state)}`,
    `處理／送出／限流／失敗：${state.processedCount}／${state.sentCount}／${state.rateLimitedCount}／${state.failedCount}`,
    `掃描／到期：${state.scannedCount}／${state.dueCount}`,
    `啟用提醒：${formatOptionalCount(activeWatchCount)}`,
  ].join("\n");
}

function formatPersonalReportStatus({
  state,
  enabled,
  databaseStatus,
}: {
  state: DiscordBotSchedulerStatusSnapshot["personalReports"];
  enabled: boolean;
  databaseStatus: {
    enabledCount: number;
    dueCount: number;
    earliestNextSendAt: Date | null;
  } | null;
}): string {
  return [
    `功能：${enabled ? "ENABLED" : "DISABLED"}`,
    `上次掃描：${formatOptionalTime(state.lastStartedAt)}`,
    `結果：${formatScheduleOutcome(state)}`,
    `處理／送出／限流／失敗：${state.processedCount}／${state.sentCount}／${state.rateLimitedCount}／${state.failedCount}`,
    `啟用設定：${databaseStatus ? databaseStatus.enabledCount : "QUERY_ERROR"}`,
    `目前到期：${databaseStatus ? databaseStatus.dueCount : "QUERY_ERROR"}`,
    `最早 nextSendAt：${databaseStatus ? formatOptionalTime(databaseStatus.earliestNextSendAt) : "QUERY_ERROR"}`,
  ].join("\n");
}

function formatPublicReportStatus({
  state,
  enabled,
  enabledSettingCount,
  nextRunAt,
}: {
  state: DiscordBotSchedulerStatusSnapshot["publicReports"];
  enabled: boolean;
  enabledSettingCount: number | null;
  nextRunAt: Date | null;
}): string {
  return [
    `功能：${enabled ? "ENABLED" : "DISABLED"}`,
    `上次掃描：${formatOptionalTime(state.lastStartedAt)}`,
    `下次掃描：${formatOptionalTime(nextRunAt)}`,
    `結果：${formatScheduleOutcome(state)}`,
    `本輪設定／處理：${state.settingCount}／${state.processedCount}`,
    `送出／略過／限流／失敗：${state.sentCount}／${state.skippedCount}／${state.rateLimitedCount}／${state.failedCount}`,
    `啟用設定：${formatOptionalCount(enabledSettingCount)}`,
  ].join("\n");
}

function formatScheduleOutcome(state: ScheduleExecutionState): string {
  if (state.lastOutcome === "OK") return "完成（`OK`）";
  if (state.lastOutcome === "ERROR") {
    return `失敗（\`ERROR\`，${state.lastErrorKind ?? "SCHEDULE_ERROR"}）`;
  }
  return "尚未執行（`NOT_RUN`）";
}

function resolveOverallSeverity({
  crawlerRuns,
  runtime,
  enabledSchedules,
  queryFailed,
  now,
}: {
  crawlerRuns: CrawlerRunRecord[] | null;
  runtime: DiscordBotSchedulerStatusSnapshot;
  enabledSchedules: {
    targetPrice: boolean;
    personalReports: boolean;
    publicReports: boolean;
  };
  queryFailed: boolean;
  now: Date;
}): StatusSeverity {
  const latestRun = crawlerRuns?.[0];
  const runtimeStates = [
    runtime.notificationLoop,
    enabledSchedules.targetPrice ? runtime.targetPrice : null,
    enabledSchedules.personalReports ? runtime.personalReports : null,
    enabledSchedules.publicReports ? runtime.publicReports : null,
  ].filter((state): state is ScheduleExecutionState => state !== null);

  if (
    runtimeStates.some((state) => state.lastOutcome === "ERROR") ||
    (latestRun && ["FETCH_FAILED", "SUSPECTED_BLOCK", "PARSE_FAILED"].includes(latestRun.status))
  ) {
    return "error";
  }

  if (
    queryFailed ||
    !latestRun ||
    latestRun.status === "RUNNING" ||
    latestRun.status === "SUCCESS_WITH_ERRORS" ||
    (latestRun.backoffUntil !== null && latestRun.backoffUntil > now) ||
    runtimeStates.some((state) => state.lastOutcome === "NOT_RUN") ||
    runtime.targetPrice.failedCount > 0 ||
    runtime.targetPrice.rateLimitedCount > 0 ||
    runtime.personalReports.failedCount > 0 ||
    runtime.personalReports.rateLimitedCount > 0 ||
    runtime.publicReports.failedCount > 0 ||
    runtime.publicReports.rateLimitedCount > 0
  ) {
    return "warning";
  }

  return "normal";
}

function hasManageGuildPermission(interaction: DiscordInteraction): boolean {
  if (
    !interaction.guild_id ||
    !interaction.member?.permissions ||
    !/^(0|[1-9][0-9]*)$/.test(interaction.member.permissions)
  ) {
    return false;
  }

  try {
    return (BigInt(interaction.member.permissions) & DISCORD_PERMISSION_MANAGE_GUILD) !== 0n;
  } catch {
    return false;
  }
}

function summarizeCrawlerRun(status: string): string {
  switch (status) {
    case "RUNNING":
      return "正在更新";
    case "SUCCESS_CHANGED":
      return "完成，有價格或商品更新";
    case "SUCCESS_UNCHANGED":
      return "完成，沒有價格變動";
    case "SUCCESS_WITH_ERRORS":
      return "完成，但部分分類需要注意";
    case "FETCH_FAILED":
      return "更新失敗";
    case "SUSPECTED_BLOCK":
      return "來源網站暫時無法正常讀取";
    case "PARSE_FAILED":
      return "部分商品資料無法整理";
    default:
      return "目前無法確認";
  }
}

function formatKnownCrawlerStatus(status: string): string {
  return [
    "RUNNING",
    "SUCCESS_CHANGED",
    "SUCCESS_UNCHANGED",
    "SUCCESS_WITH_ERRORS",
    "FETCH_FAILED",
    "SUSPECTED_BLOCK",
    "PARSE_FAILED",
  ].includes(status)
    ? status
    : "UNKNOWN";
}

function severityColor(severity: StatusSeverity): number {
  if (severity === "normal") return DISCORD_TARGET_PRICE_REACHED_COLOR;
  if (severity === "error") return DISCORD_STATUS_ERROR_COLOR;
  return DISCORD_STATUS_WARNING_COLOR;
}

function formatOptionalTime(value: Date | null): string {
  if (!value) return "尚無資料";

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

function formatOptionalDuration(value: number | null): string {
  return value === null ? "尚無資料" : formatDuration(value);
}

function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours > 0 ? `${hours} 小時` : null,
    minutes > 0 ? `${minutes} 分鐘` : null,
    hours === 0 ? `${seconds} 秒` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}

function formatOptionalCount(value: number | null): string {
  return value === null ? "QUERY_ERROR" : String(value);
}
