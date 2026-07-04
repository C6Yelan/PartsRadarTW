// apps/web/app/products/[id]/price-history/chart/overlays.tsx

import { formatPointSource, formatPrice, formatSignedPercent, formatTooltipDate } from "../format";
import type { ChartConfig, ChartMarker, ChartPoint } from "../types";

export function FixedChartMarker({
  chartConfig,
  marker,
}: {
  chartConfig: ChartConfig;
  marker: ChartMarker;
}) {
  return (
    <div
      className={`history-chart-marker is-${marker.tone}`}
      style={{
        left: `${(marker.point.x / chartConfig.width) * 100}%`,
        top: `${(marker.point.y / chartConfig.height) * 100}%`,
      }}
    >
      <span>{marker.label}</span>
      <strong>{formatPrice(marker.point.amount)}</strong>
    </div>
  );
}

export function HistoryTooltip({
  chartConfig,
  point,
}: {
  chartConfig: ChartConfig;
  point: ChartPoint;
}) {
  const left = `${Math.min(Math.max((point.x / chartConfig.width) * 100, 12), 88)}%`;
  const top = `${(point.y / chartConfig.height) * 100}%`;

  return (
    <div className="history-tooltip" style={{ left, top }}>
      <span>{formatTooltipDate(point.observedAt)}</span>
      <strong>{formatPrice(point.amount)}</strong>
      <small>{`${formatPointSource(point.source)} · ${formatSignedPercent(point.percentChange)}`}</small>
    </div>
  );
}
