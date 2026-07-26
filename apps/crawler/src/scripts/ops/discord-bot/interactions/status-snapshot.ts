// 讀取 /status 訊息需要的資料庫快照，不處理顯示文字或健康度政策。

import type { DiscordBotClient } from "../types";

export type StatusClient = Pick<
  DiscordBotClient,
  | "crawlRun"
  | "discordPriceReportSetting"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
>;

export interface CrawlerRunRecord {
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  backoffUntil: Date | null;
  categoryResults: Array<{ status: string }>;
}

export async function readCrawlerStatus(client: StatusClient): Promise<{
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

export async function readPersonalReportDatabaseStatus(
  client: StatusClient,
  now: Date,
): Promise<{
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
