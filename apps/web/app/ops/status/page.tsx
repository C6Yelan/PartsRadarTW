// apps/web/app/ops/status/page.tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { extractBearerToken, isOpsStatusAccessAllowed } from "./access";
import { collectOpsStatus, createPrismaOpsStatusClient, type OpsStatusLevel } from "./data";

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

const LEVEL_LABELS: Record<OpsStatusLevel, string> = {
  ok: "OK",
  warn: "WARN",
  fail: "FAIL",
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const numberFormatter = new Intl.NumberFormat("zh-TW");

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
      </section>

      <section className="ops-table-panel" aria-labelledby="ops-runs-heading">
        <div className="ops-section-heading">
          <h2 id="ops-runs-heading">最近 Crawl Runs</h2>
          <p>顯示高層級結果與數量，不輸出 error message。</p>
        </div>
        <div className="ops-table-scroll">
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Trigger</th>
                <th scope="col">Started</th>
                <th scope="col">Finished</th>
                <th scope="col">Prices</th>
                <th scope="col">Parse</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentCrawlRuns.map((run) => (
                <tr key={run.id}>
                  <td>{run.status}</td>
                  <td>{run.triggerType}</td>
                  <td>{formatDateTime(run.startedAt)}</td>
                  <td>{formatDateTime(run.finishedAt)}</td>
                  <td>{formatNumber(run._count.priceSnapshots)}</td>
                  <td>{formatNumber(run._count.parseErrors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ops-table-panel" aria-labelledby="ops-source-heading">
        <div className="ops-section-heading">
          <h2 id="ops-source-heading">來源分類</h2>
          <p>用於確認分類同步時間是否集中落後。</p>
        </div>
        <div className="ops-table-scroll">
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">IGrp</th>
                <th scope="col">分類</th>
                <th scope="col">Source</th>
                <th scope="col">Last checked</th>
                <th scope="col">Last success</th>
              </tr>
            </thead>
            <tbody>
              {summary.sourceCategories.map((category) => (
                <tr key={category.igrp}>
                  <td>{category.igrp}</td>
                  <td>{category.displayName}</td>
                  <td>{category.sourceName}</td>
                  <td>{formatDateTime(category.lastCheckedAt)}</td>
                  <td>{formatDateTime(category.lastSuccessAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StatusPill({ level }: { level: OpsStatusLevel }) {
  return <span className={`ops-status-pill is-${level}`}>{LEVEL_LABELS[level]}</span>;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ops-metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LinkHealthColumn({
  title,
  summary,
}: {
  title: string;
  summary: { ok: number; broken: number; temporaryError: number };
}) {
  return (
    <dl className="ops-link-health-column">
      <div>
        <dt>{title} OK</dt>
        <dd>{formatNumber(summary.ok)}</dd>
      </div>
      <div>
        <dt>{title} temporary</dt>
        <dd>{formatNumber(summary.temporaryError)}</dd>
      </div>
      <div>
        <dt>{title} broken</dt>
        <dd>{formatNumber(summary.broken)}</dd>
      </div>
    </dl>
  );
}

function formatDateTime(value: Date | null): string {
  return value ? dateTimeFormatter.format(value) : "尚無資料";
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
