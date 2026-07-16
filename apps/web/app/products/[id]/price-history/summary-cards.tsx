// apps/web/app/products/[id]/price-history/summary-cards.tsx
// 呈現價格歷史摘要卡片，包含期間變動、歷史區間位置與高低均價資訊。

import {
  formatSignedPercent,
  formatSignedTwdPrice,
  formatTwdPrice,
} from "../../../_shared/formatting";
import { formatTaipeiMonthDay } from "../../../_shared/time";
import { formatHistoryPointCount } from "./format";
import type { HistoryViewSummary, PriceHistoryRangeDays, PriceHistoryRangeKey } from "./types";

// 顯示選定期間首尾價格差與價格訊號，提供價格趨勢的快速判讀。
export function PeriodDeltaCard({ summary }: { summary: HistoryViewSummary }) {
  return (
    <div className={`history-period-card is-${summary.signal.tone}`}>
      <span>期間變動</span>
      <strong>{`${formatSignedTwdPrice(summary.deltaAmount, "資料不足")} / ${formatSignedPercent(
        summary.deltaPercent,
        2,
        "",
      )}`}</strong>
      <small>{summary.signal.label}</small>
    </div>
  );
}

// 顯示價格歷史區間摘要，包含目前位置、最低價、最高價與平均價。
export function HistoryRangeCard({
  range,
  rangeDays,
  summary,
}: {
  range: PriceHistoryRangeKey;
  rangeDays: PriceHistoryRangeDays | null;
  summary: HistoryViewSummary;
}) {
  if (!summary.lowest || !summary.highest) {
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
            <strong>{formatTwdPrice(summary.lowest.amount)}</strong>
          </span>
          <span className="history-range-endpoint is-high">
            <span>最高</span>
            <strong>{formatTwdPrice(summary.highest.amount)}</strong>
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
          <strong>{formatTwdPrice(summary.lowest.amount)}</strong>
          <small>{formatTaipeiMonthDay(summary.lowest.observedAt)}</small>
        </div>
        <div className="history-range-stat is-high">
          <span>最高</span>
          <strong>{formatTwdPrice(summary.highest.amount)}</strong>
          <small>{formatTaipeiMonthDay(summary.highest.observedAt)}</small>
        </div>
        <div className="history-range-stat is-average">
          <span>均價</span>
          <strong>
            {summary.averageAmount === null ? "-" : formatTwdPrice(summary.averageAmount)}
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
