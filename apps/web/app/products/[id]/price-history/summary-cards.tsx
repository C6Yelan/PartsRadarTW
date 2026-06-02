import type { HistoryViewSummary, PriceHistoryRangeDays, PriceHistoryRangeKey } from "./types";
import {
  formatCompactDate,
  formatHistoryPointCount,
  formatPrice,
  formatSignedPercent,
  formatSignedPrice,
} from "./format";

export function PeriodDeltaCard({ summary }: { summary: HistoryViewSummary }) {
  return (
    <div className={`history-period-card is-${summary.signal.tone}`}>
      <span>期間變動</span>
      <strong>{`${formatSignedPrice(summary.deltaAmount)} / ${formatSignedPercent(
        summary.deltaPercent,
      )}`}</strong>
      <small>{summary.signal.label}</small>
    </div>
  );
}

export function HistoryRangeCard({
  range,
  rangeDays,
  summary,
}: {
  range: PriceHistoryRangeKey;
  rangeDays: PriceHistoryRangeDays | null;
  summary: HistoryViewSummary;
}) {
  if (!summary.lowest || !summary.highest || !summary.latest) {
    return null;
  }

  return (
    <div className="history-range-card">
      <div className="history-range-heading">
        <strong>{formatRangeSummaryTitle(range, rangeDays)}</strong>
        <span>{formatHistoryPointCount(summary.pointCount)}</span>
      </div>
      <div className="history-range-track-wrap">
        <span className="history-range-caption">價格區間</span>
        <div className="history-range-endpoints">
          <span className="history-range-endpoint is-low">
            <span>最低</span>
            <strong>{formatPrice(summary.lowest.amount)}</strong>
          </span>
          <span className="history-range-endpoint is-high">
            <span>最高</span>
            <strong>{formatPrice(summary.highest.amount)}</strong>
          </span>
        </div>
        <div className="history-range-track" aria-hidden="true">
          <span
            className="history-range-marker"
            style={{ left: `clamp(5px, ${summary.rangePositionPercent}%, calc(100% - 5px))` }}
          />
        </div>
      </div>
      <div className="history-range-stats">
        <div className="history-range-stat is-low">
          <span>最低</span>
          <strong>{formatPrice(summary.lowest.amount)}</strong>
          <small>{formatCompactDate(summary.lowest.observedAt)}</small>
        </div>
        <div className="history-range-stat is-high">
          <span>最高</span>
          <strong>{formatPrice(summary.highest.amount)}</strong>
          <small>{formatCompactDate(summary.highest.observedAt)}</small>
        </div>
        <div className="history-range-stat is-average">
          <span>均價</span>
          <strong>
            {summary.averageAmount === null ? "-" : formatPrice(summary.averageAmount)}
          </strong>
          <small>區間平均</small>
        </div>
      </div>
    </div>
  );
}

function formatRangeSummaryTitle(
  range: PriceHistoryRangeKey,
  rangeDays: PriceHistoryRangeDays | null,
) {
  return range === "all" ? "全部摘要" : `${rangeDays} 天摘要`;
}
