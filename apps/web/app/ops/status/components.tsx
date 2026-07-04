// apps/web/app/ops/status/components.tsx

import type { OpsStatusLevel, OpsStatusSummary } from "./data";

const LEVEL_LABELS: Record<OpsStatusLevel, string> = {
  ok: "OK",
  warn: "WARN",
  fail: "FAIL",
};
const DISCORD_DELIVERY_KIND_LABELS: Record<string, string> = {
  PRICE_REPORT_NOW: "立即報告 / 預覽",
  SCHEDULED_PRICE_REPORT: "每日價格報告",
  TARGET_PRICE: "目標價通知",
};
const DISCORD_DELIVERY_STATUS_LABELS: Record<string, string> = {
  SENT: "sent",
  SKIPPED: "skipped",
  FAILED: "failed",
  RATE_LIMITED: "rate limited",
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

export function StatusPill({ level }: { level: OpsStatusLevel }) {
  return <span className={`ops-status-pill is-${level}`}>{LEVEL_LABELS[level]}</span>;
}

export function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ops-metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function LinkHealthColumn({
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

export function DiscordDeliveriesTable({
  deliveries,
}: {
  deliveries: OpsStatusSummary["discordBot"]["latestDeliveries"];
}) {
  return (
    <section className="ops-table-panel" aria-labelledby="ops-discord-heading">
      <div className="ops-section-heading">
        <h2 id="ops-discord-heading">最近 Discord Deliveries</h2>
        <p>只顯示發送類型、狀態、時間與數量，不輸出 user id 或錯誤內容。</p>
      </div>
      <div className="ops-table-scroll">
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">Delivered</th>
              <th scope="col">Items</th>
              <th scope="col">Messages</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length > 0 ? (
              deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{formatDiscordDeliveryKind(delivery.kind)}</td>
                  <td>{formatDiscordDeliveryStatus(delivery.status)}</td>
                  <td>{formatDateTime(delivery.createdAt)}</td>
                  <td>{formatDateTime(delivery.deliveredAt)}</td>
                  <td>{formatNumber(delivery.itemCount)}</td>
                  <td>{formatNumber(delivery.messageCount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>尚無 Discord delivery 紀錄</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CrawlRunsTable({ runs }: { runs: OpsStatusSummary["recentCrawlRuns"] }) {
  return (
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
            {runs.map((run) => (
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
  );
}

export function SourceCategoriesTable({
  categories,
}: {
  categories: OpsStatusSummary["sourceCategories"];
}) {
  return (
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
            {categories.map((category) => (
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
  );
}

export function countDiscordDeliveryProblems(discordBot: OpsStatusSummary["discordBot"]): number {
  const recent = discordBot.recentDeliveries;

  return (
    recent.priceReportNow.failed +
    recent.priceReportNow.rateLimited +
    recent.scheduledPriceReport.failed +
    recent.scheduledPriceReport.rateLimited +
    recent.targetPrice.failed +
    recent.targetPrice.rateLimited
  );
}

function formatDiscordDeliveryKind(kind: string): string {
  return DISCORD_DELIVERY_KIND_LABELS[kind] ?? kind;
}

function formatDiscordDeliveryStatus(status: string): string {
  return DISCORD_DELIVERY_STATUS_LABELS[status] ?? status.toLowerCase();
}

export function formatDateTime(value: Date | null): string {
  return value ? dateTimeFormatter.format(value) : "尚無資料";
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
