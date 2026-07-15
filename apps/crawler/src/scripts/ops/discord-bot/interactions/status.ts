// apps/crawler/src/scripts/ops/discord-bot/interactions/status.ts
// 建立管理員可見的 bot 與商品資料更新狀態，僅查詢本程序與既有資料庫摘要。

import {
  DISCORD_PERMISSION_MANAGE_GUILD,
  DISCORD_TARGET_PRICE_REACHED_COLOR,
  TIME_ZONE,
} from "../constants";
import { sendInteractionResponse } from "../rest";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotOptions,
  DiscordInteraction,
  FetchImpl,
} from "../types";

const DISCORD_STATUS_WARNING_COLOR = 0xeab308;
const DISCORD_STATUS_ERROR_COLOR = 0xdc2626;

type StatusClient = Pick<DiscordBotClient, "crawlRun" | "sourceCategory">;

type StatusSeverity = "normal" | "warning" | "error";

export async function handleStatusInteraction({
  client,
  interaction,
  options,
  fetchImpl,
  now = new Date(),
  uptimeSeconds = process.uptime(),
}: {
  client: StatusClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  now?: Date;
  uptimeSeconds?: number;
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

  const message = await createStatusMessage({ client, options, now, uptimeSeconds });

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
  now = new Date(),
  uptimeSeconds = process.uptime(),
}: {
  client: StatusClient;
  options: Pick<
    DiscordBotOptions,
    "personalReportsEnabled" | "publicReportsEnabled" | "targetWatchesEnabled"
  >;
  now?: Date;
  uptimeSeconds?: number;
}): Promise<DiscordBotMessage> {
  const featureValue = [
    `目標價提醒：${formatFeatureState(options.targetWatchesEnabled)}`,
    `個人價格報告：${formatFeatureState(options.personalReportsEnabled)}`,
    `公開價格報告：${formatFeatureState(options.publicReportsEnabled)}`,
  ].join("\n");

  try {
    const [latestRun, enabledCategoryCount, missingSuccessCount, oldestCategory] =
      await Promise.all([
        client.crawlRun.findFirst({
          where: { triggerType: "SCHEDULED" },
          orderBy: { startedAt: "desc" },
          select: {
            status: true,
            startedAt: true,
            finishedAt: true,
            backoffUntil: true,
            categoryResults: { select: { status: true } },
          },
        }),
        client.sourceCategory.count({ where: { enabled: true } }),
        client.sourceCategory.count({ where: { enabled: true, lastSuccessAt: null } }),
        client.sourceCategory.findFirst({
          where: { enabled: true, lastSuccessAt: { not: null } },
          orderBy: { lastSuccessAt: "asc" },
          select: { lastSuccessAt: true },
        }),
      ]);

    const runState = summarizeRun(latestRun, now);
    const successCount =
      latestRun?.categoryResults.filter((result) => result.status.startsWith("SUCCESS_")).length ??
      0;
    const failedCount = (latestRun?.categoryResults.length ?? 0) - successCount;
    const dataRange = [
      `已啟用分類：${enabledCategoryCount}`,
      `最近最舊分類更新：${formatOptionalTime(oldestCategory?.lastSuccessAt ?? null)}`,
      missingSuccessCount > 0 ? `尚無成功更新紀錄：${missingSuccessCount} 個分類` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    return {
      embeds: [
        {
          title: "PartsRadarTW 系統狀態",
          description: "目前機器人與商品資料更新概況。",
          color: severityColor(runState.severity),
          timestamp: now.toISOString(),
          fields: [
            {
              name: "機器人",
              value: `🟢 運作正常\n已運作 ${formatUptime(uptimeSeconds)}\nGateway：已連線`,
            },
            {
              name: "商品資料更新",
              value: `${runState.summary}\n最新一次完成時間：${formatOptionalTime(latestRun?.finishedAt ?? null)}`,
            },
            {
              name: "最近一次爬取",
              value: latestRun
                ? [
                    runState.detail,
                    `開始：${formatOptionalTime(latestRun.startedAt)}`,
                    `完成：${formatOptionalTime(latestRun.finishedAt)}`,
                    `成功／失敗分類：${successCount}／${failedCount}`,
                  ].join("\n")
                : "尚無排程更新紀錄。",
            },
            { name: "功能", value: featureValue },
            { name: "資料範圍", value: dataRange },
          ],
        },
      ],
    };
  } catch {
    return {
      embeds: [
        {
          title: "PartsRadarTW 系統狀態",
          description: "目前機器人與商品資料更新概況。",
          color: DISCORD_STATUS_WARNING_COLOR,
          timestamp: now.toISOString(),
          fields: [
            {
              name: "機器人",
              value: `🟢 運作正常\n已運作 ${formatUptime(uptimeSeconds)}\nGateway：已連線`,
            },
            { name: "商品資料更新", value: "目前無法讀取資料更新狀態。" },
            { name: "最近一次爬取", value: "目前無法確認。" },
            { name: "功能", value: featureValue },
            { name: "資料範圍", value: "目前無法確認。" },
          ],
        },
      ],
    };
  }
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

function summarizeRun(
  run: {
    status: string;
    backoffUntil: Date | null;
  } | null,
  now: Date,
): { summary: string; detail: string; severity: StatusSeverity } {
  if (!run) {
    return { summary: "無法確認", detail: "尚無排程更新紀錄。", severity: "warning" };
  }

  const waitingToRetry = run.backoffUntil !== null && run.backoffUntil > now;

  switch (run.status) {
    case "RUNNING":
      return { summary: "正在更新", detail: "正在更新", severity: "warning" };
    case "SUCCESS_CHANGED":
      return {
        summary: waitingToRetry ? "需要注意" : "正常",
        detail: "完成，有價格或商品更新",
        severity: waitingToRetry ? "warning" : "normal",
      };
    case "SUCCESS_UNCHANGED":
      return {
        summary: waitingToRetry ? "需要注意" : "正常",
        detail: "完成，沒有新的價格變動",
        severity: waitingToRetry ? "warning" : "normal",
      };
    case "SUCCESS_WITH_ERRORS":
      return { summary: "需要注意", detail: "完成，但部分分類需要注意", severity: "warning" };
    case "FETCH_FAILED":
      return { summary: "需要注意", detail: "更新失敗", severity: "error" };
    case "SUSPECTED_BLOCK":
      return {
        summary: "需要注意",
        detail: "來源網站暫時無法正常讀取",
        severity: "error",
      };
    case "PARSE_FAILED":
      return {
        summary: "需要注意",
        detail: "部分商品資料無法整理",
        severity: "error",
      };
    default:
      return { summary: "無法確認", detail: "目前無法確認。", severity: "warning" };
  }
}

function severityColor(severity: StatusSeverity): number {
  if (severity === "normal") return DISCORD_TARGET_PRICE_REACHED_COLOR;
  if (severity === "error") return DISCORD_STATUS_ERROR_COLOR;
  return DISCORD_STATUS_WARNING_COLOR;
}

function formatFeatureState(enabled: boolean): string {
  return enabled ? "開啟" : "關閉";
}

function formatOptionalTime(value: Date | null): string {
  if (!value) return "尚無資料";

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function formatUptime(value: number): string {
  const totalMinutes = Math.max(0, Math.floor(value / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  return [days > 0 ? `${days} 天` : null, hours > 0 ? `${hours} 小時` : null, `${minutes} 分鐘`]
    .filter((part): part is string => part !== null)
    .join(" ");
}
