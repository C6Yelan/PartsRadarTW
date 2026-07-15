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
            inline: true,
          },
          {
            name: "Discord 通知排程主迴圈",
            value: formatNotificationLoop(runtime.notificationLoop, scanIntervalMs),
            inline: true,
          },
          {
            name: "目標價提醒掃描",
            value: formatTargetPriceStatus({
              state: runtime.targetPrice,
              enabled: options.targetWatchesEnabled,
              activeWatchCount,
            }),
            inline: true,
          },
          {
            name: "個人價格報告排程",
            value: formatPersonalReportStatus({
              state: runtime.personalReports,
              enabled: options.personalReportsEnabled,
              databaseStatus: personal,
            }),
            inline: true,
          },
          {
            name: "公開價格報告排程",
            value: formatPublicReportStatus({
              state: runtime.publicReports,
              enabled: options.publicReportsEnabled,
              enabledSettingCount: enabledPublicSettingCount,
            }),
            inline: true,
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
    ? formatCompactDuration(latestRun.startedAt.getTime() - status.runs[1].startedAt.getTime())
    : "尚無足夠資料";
  const successCount = latestRun.categoryResults.filter((result) =>
    result.status.startsWith("SUCCESS_"),
  ).length;
  const failedCount = latestRun.categoryResults.length - successCount;
  const backingOff = latestRun.backoffUntil !== null && latestRun.backoffUntil > now;
  const runtimeState = backingOff
    ? "BACKOFF"
    : latestRun.status === "RUNNING"
      ? "RUNNING"
      : "IDLE";
  const latestRunSucceeded =
    (latestRun.status === "SUCCESS_CHANGED" || latestRun.status === "SUCCESS_UNCHANGED") &&
    finishedAt !== null;
  const latestSuccessMatchesCompletion =
    latestRunSucceeded &&
    status.latestSuccessfulFinishedAt !== null &&
    finishedAt.getTime() === status.latestSuccessfulFinishedAt.getTime();

  return [
    `狀態：${runtimeState} · ${runSummary}`,
    `代碼：\`${formatKnownCrawlerStatus(latestRun.status)}\``,
    `執行：${formatCrawlerExecution(latestRun.startedAt, finishedAt, durationEnd)}`,
    `間隔：${observedInterval}`,
    `分類：${successCount} 成功／${failedCount} 失敗`,
    backingOff ? `Backoff 至：${formatStatusTime(latestRun.backoffUntil)}` : null,
    latestSuccessMatchesCompletion
      ? null
      : `最近成功：${formatStatusTime(status.latestSuccessfulFinishedAt)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatNotificationLoop(state: ScheduleExecutionState, scanIntervalMs: number): string {
  if (state.lastOutcome === "NOT_RUN") {
    return [
      "上次：尚未完成第一輪 · `NOT_RUN`",
      `下次：${formatStatusTime(state.nextRunAt)}`,
      `週期：${formatSchedulePeriod(scanIntervalMs)}`,
    ].join("\n");
  }

  return [
    `上次：${formatStatusTime(state.lastCompletedAt ?? state.lastStartedAt)} · \`${state.lastOutcome}\` · ${formatCompactDuration(state.lastDurationMs)}`,
    `下次：${formatStatusTime(state.nextRunAt)}`,
    `週期：${formatSchedulePeriod(scanIntervalMs)}`,
    state.lastOutcome === "ERROR" ? `錯誤：${formatScheduleErrorKind(state)}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatTargetPriceStatus({
  state,
  enabled,
  activeWatchCount,
}: {
  state: DiscordBotSchedulerStatusSnapshot["targetPrice"];
  enabled: boolean;
  activeWatchCount: number | null;
}): string {
  return [
    enabled ? null : "功能：`DISABLED`",
    `結果：\`${state.lastOutcome}\``,
    `啟用提醒：${formatOptionalCount(activeWatchCount)}`,
    `掃描／到期／處理／送出：${state.scannedCount}／${state.dueCount}／${state.processedCount}／${state.sentCount}`,
    state.rateLimitedCount > 0 || state.failedCount > 0
      ? `限流／失敗：${state.rateLimitedCount}／${state.failedCount}`
      : null,
    state.lastOutcome === "ERROR" ? `錯誤：${formatScheduleErrorKind(state)}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
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
    enabled ? null : "功能：`DISABLED`",
    `結果：\`${state.lastOutcome}\``,
    `設定／到期：${databaseStatus ? `${databaseStatus.enabledCount}／${databaseStatus.dueCount}` : "QUERY_ERROR／QUERY_ERROR"}`,
    `下次送出：${databaseStatus ? formatStatusMinute(databaseStatus.earliestNextSendAt) : "QUERY_ERROR"}`,
    `處理／送出：${state.processedCount}／${state.sentCount}`,
    state.rateLimitedCount > 0 || state.failedCount > 0
      ? `限流／失敗：${state.rateLimitedCount}／${state.failedCount}`
      : null,
    state.lastOutcome === "ERROR" ? `錯誤：${formatScheduleErrorKind(state)}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatPublicReportStatus({
  state,
  enabled,
  enabledSettingCount,
}: {
  state: DiscordBotSchedulerStatusSnapshot["publicReports"];
  enabled: boolean;
  enabledSettingCount: number | null;
}): string {
  return [
    enabled ? null : "功能：`DISABLED`",
    `結果：\`${state.lastOutcome}\``,
    `設定／處理：${state.settingCount}／${state.processedCount}`,
    `送出／略過：${state.sentCount}／${state.skippedCount}`,
    enabledSettingCount === null
      ? "啟用設定：QUERY_ERROR"
      : enabledSettingCount !== state.settingCount
        ? `啟用設定：${enabledSettingCount}`
        : null,
    state.rateLimitedCount > 0 || state.failedCount > 0
      ? `限流／失敗：${state.rateLimitedCount}／${state.failedCount}`
      : null,
    state.lastOutcome === "ERROR" ? `錯誤：${formatScheduleErrorKind(state)}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
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

interface StatusTimeParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function readStatusTimeParts(value: Date | null): StatusTimeParts | null {
  if (!value || !Number.isFinite(value.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const { year, month, day, hour, minute, second } = values;
  if (!year || !month || !day || !hour || !minute || !second) return null;

  return { year, month, day, hour, minute, second };
}

function formatStatusTime(value: Date | null): string {
  const parts = readStatusTimeParts(value);
  if (!parts) return "尚無資料";

  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatStatusMinute(value: Date | null): string {
  const parts = readStatusTimeParts(value);
  if (!parts) return "尚無資料";

  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatCrawlerExecution(startedAt: Date, finishedAt: Date | null, durationEnd: Date): string {
  const startParts = readStatusTimeParts(startedAt);
  const start = formatStatusTime(startedAt);
  const duration = formatCompactDuration(durationEnd.getTime() - startedAt.getTime());

  if (!finishedAt) return `${start} 起（已執行 ${duration}）`;

  const endParts = readStatusTimeParts(finishedAt);
  const end =
    startParts &&
    endParts &&
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day
      ? `${endParts.hour}:${endParts.minute}:${endParts.second}`
      : formatStatusTime(finishedAt);

  return `${start} → ${end}（${duration}）`;
}

function formatCompactDuration(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "尚無資料";

  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours > 0 ? `${hours} 小時` : null,
    minutes > 0 ? `${minutes} 分` : null,
    seconds > 0 || totalSeconds === 0 ? `${seconds} 秒` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}

function formatSchedulePeriod(value: number): string {
  if (!Number.isFinite(value)) return "尚無資料";
  if (value % 3_600_000 === 0) return `${value / 3_600_000} 小時`;
  if (value % 60_000 === 0) return `${value / 60_000} 分鐘`;
  return formatCompactDuration(value);
}

function formatScheduleErrorKind(state: ScheduleExecutionState): string {
  return state.lastErrorKind ?? "SCHEDULE_ERROR";
}

function formatOptionalCount(value: number | null): string {
  return value === null ? "QUERY_ERROR" : String(value);
}
