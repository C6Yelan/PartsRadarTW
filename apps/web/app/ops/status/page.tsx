// apps/web/app/ops/status/page.tsx
// 提供受保護的內部 /ops/status 頁面，顯示資料健康、排程與 Discord delivery 摘要。

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { extractBearerToken, isOpsStatusAccessAllowed } from "./access";
import {
  collectOpsStatus,
  createPrismaOpsStatusClient,
} from "./data";
import {
  CrawlRunsTable,
  DiscordDeliveriesTable,
  LinkHealthColumn,
  MetricTile,
  SourceCategoriesTable,
  StatusPill,
  countDiscordDeliveryProblems,
  formatDateTime,
  formatNumber,
} from "./components";

// ops status 需讀取 runtime env、DB 與本機檔案狀態，因此每次 request 動態產生。
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Ops Status | PartsRadarTW",
  robots: {
    index: false,
    follow: false,
  },
};

interface OpsStatusPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

// 驗證 ops token 後收集內部狀態；未授權一律回 404，避免公開暴露頁面存在。
export default async function OpsStatusPage({ searchParams }: OpsStatusPageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([searchParams, headers()]);
  const providedToken =
    firstSearchParam(resolvedSearchParams.token) ??
    requestHeaders.get("x-ops-status-token") ??
    extractBearerToken(requestHeaders.get("authorization"));

  if (!isOpsStatusAccessAllowed(process.env, providedToken)) {
    notFound();
  }

  const { prisma } = await import("@partsradar/db");
  const summary = await collectOpsStatus(createPrismaOpsStatusClient(prisma), {
    env: process.env,
    productImageStorageDir: process.env.PRODUCT_IMAGE_STORAGE_DIR,
  });
  const discordDeliveryProblems = countDiscordDeliveryProblems(summary.discordBot);

  return (
    <main className="ops-status-shell">
      <header className="ops-status-header">
        <div>
          <p className="ops-status-eyebrow">PartsRadarTW</p>
          <h1>內部營運狀態</h1>
          <p>只顯示聚合後的資料健康與部署狀態，不顯示 raw error、來源原文或 secret。</p>
        </div>
        <StatusPill level={summary.overallLevel} />
      </header>

      <section className="ops-status-meta" aria-label="status metadata">
        <MetricTile label="產生時間" value={formatDateTime(summary.generatedAt)} />
        <MetricTile label="Active 商品" value={formatNumber(summary.productCounts.active)} />
        <MetricTile label="可顯示商品" value={formatNumber(summary.productCounts.displayReady)} />
        <MetricTile label="缺圖快取" value={formatNumber(summary.productCounts.missingImages)} />
        <MetricTile
          label="每日報告啟用"
          value={`${formatNumber(summary.discordBot.priceReportSettings.enabled)} / ${formatNumber(
            summary.discordBot.priceReportSettings.total,
          )}`}
        />
        <MetricTile
          label="目標價追蹤"
          value={formatNumber(summary.discordBot.targetPriceWatches.active)}
        />
      </section>

      <section className="ops-check-grid" aria-label="status checks">
        {summary.checks.map((check) => (
          <article className={`ops-check-card is-${check.level}`} key={check.key}>
            <div className="ops-check-card-header">
              <h2>{check.label}</h2>
              <StatusPill level={check.level} />
            </div>
            <p>{check.message}</p>
          </article>
        ))}
      </section>

      <section className="ops-runtime-panel" aria-labelledby="ops-runtime-heading">
        <div className="ops-section-heading">
          <h2 id="ops-runtime-heading">排程與互斥策略</h2>
          <p>依目前部署 env 與程式預設值彙整，不代表 container process 存活檢查。</p>
        </div>
        <div className="ops-runtime-layout">
          <div className="ops-schedule-list">
            {summary.runtimeSchedule.jobs.map((job) => (
              <section className="ops-schedule-row" key={job.key}>
                <div>
                  <h3>{job.label}</h3>
                  <p>{job.cadence}</p>
                </div>
                <ul>
                  {job.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <dl className="ops-policy-list">
            {summary.runtimeSchedule.policies.map((policy) => (
              <div key={policy.key}>
                <dt>{policy.label}</dt>
                <dd>{policy.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="ops-status-columns" aria-label="data quality details">
        <article className="ops-panel">
          <h2>Link Health</h2>
          <div className="ops-link-health-grid">
            <LinkHealthColumn title="Source" summary={summary.linkHealth.source} />
          </div>
        </article>

        <article className="ops-panel">
          <h2>近期訊號</h2>
          <dl className="ops-stat-list">
            <div>
              <dt>觀察窗口</dt>
              <dd>{summary.recentSignals.windowHours}h</dd>
            </div>
            <div>
              <dt>疑似攔截</dt>
              <dd>{formatNumber(summary.recentSignals.suspectedBlocks)}</dd>
            </div>
            <div>
              <dt>解析錯誤</dt>
              <dd>{formatNumber(summary.recentSignals.parseErrors)}</dd>
            </div>
            <div>
              <dt>來源圖片異常</dt>
              <dd>{formatNumber(summary.recentSignals.invalidImageUrls)}</dd>
            </div>
            <div>
              <dt>Expired raw snapshots</dt>
              <dd>{formatNumber(summary.rawSnapshotRetention.expired)}</dd>
            </div>
          </dl>
        </article>

        <article className="ops-panel">
          <h2>Discord Bot</h2>
          <dl className="ops-stat-list">
            <div>
              <dt>每日報告設定</dt>
              <dd>
                {formatNumber(summary.discordBot.priceReportSettings.enabled)} /{" "}
                {formatNumber(summary.discordBot.priceReportSettings.total)}
              </dd>
            </div>
            <div>
              <dt>待發每日報告</dt>
              <dd>{formatNumber(summary.discordBot.priceReportSettings.dueNow)}</dd>
            </div>
            <div>
              <dt>啟用中目標價</dt>
              <dd>{formatNumber(summary.discordBot.targetPriceWatches.active)}</dd>
            </div>
            <div>
              <dt>已通知目標價</dt>
              <dd>{formatNumber(summary.discordBot.targetPriceWatches.notified)}</dd>
            </div>
            <div>
              <dt>發送 claim 中</dt>
              <dd>{formatNumber(summary.discordBot.targetPriceWatches.claimed)}</dd>
            </div>
            <div>
              <dt>近期發送問題</dt>
              <dd>{formatNumber(discordDeliveryProblems)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <DiscordDeliveriesTable deliveries={summary.discordBot.latestDeliveries} />
      <CrawlRunsTable runs={summary.recentCrawlRuns} />
      <SourceCategoriesTable categories={summary.sourceCategories} />
    </main>
  );
}

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
