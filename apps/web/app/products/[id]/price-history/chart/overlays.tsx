// apps/web/app/products/[id]/price-history/chart/overlays.tsx
// 顯示價格走勢圖上的固定高低點標記與互動 tooltip。

import { formatPointSource, formatPrice, formatSignedPercent, formatTooltipDate } from "../format";
import type { ChartConfig, ChartMarker, ChartPoint } from "../types";

// 將 chart marker 座標轉成圖表容器內的百分比位置，固定標示最高或最低點。
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

// 顯示目前聚焦價格點的時間、價格、觀測來源與相對漲跌幅。
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
      <small>{`${formatPointSource(point.observationType)} · ${formatSignedPercent(
        point.percentChange,
      )}`}</small>
    </div>
  );
}
