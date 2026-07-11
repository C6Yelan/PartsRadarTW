"use client";
// apps/web/app/products/[id]/price-history/chart.tsx
// 繪製商品價格歷史走勢圖，包含 SVG 折線、互動點位、固定標記與空資料狀態。

import { formatTaipeiMonthDay } from "../../../_shared/time";
import { FixedChartMarker, HistoryTooltip } from "./chart/overlays";
import { getInsufficientDataMessage, getPointAriaLabel } from "./format";
import type {
  ChartModel,
  HistoryViewSummary,
  PriceHistoryRangeDays,
  PriceHistoryRangeKey,
} from "./types";

// 呈現價格歷史 chart model，並把滑鼠、焦點與點擊事件轉成目前作用中的價格點。
export function PriceHistoryChart({
  activePointKey,
  chart,
  range,
  rangeDays,
  summary,
  onActivePointKeyChange,
}: {
  activePointKey: string | null;
  chart: ChartModel | null;
  range: PriceHistoryRangeKey;
  rangeDays: PriceHistoryRangeDays | null;
  summary: HistoryViewSummary;
  onActivePointKeyChange(pointKey: string | null): void;
}) {
  const activePoint = chart?.points.find((point) => point.key === activePointKey) ?? null;

  return (
    <div className="history-chart-wrap">
      <div className="history-chart-card-header">
        <h3>走勢圖</h3>
      </div>
      {chart ? (
        <>
          <div className="history-chart-stage">
            <svg
              className="history-chart"
              role="img"
              aria-label={formatChartAriaLabel(range, rangeDays)}
              viewBox={`0 0 ${chart.config.width} ${chart.config.height}`}
            >
              {chart.ticks.map((tick, index) => (
                <g className="history-chart-tick" key={tick.label}>
                  <text x={chart.config.padding.left - 8} y={tick.y + 4}>
                    {tick.label}
                  </text>
                  {index < chart.ticks.length - 1 ? (
                    <line
                      x1={chart.config.padding.left}
                      x2={chart.config.width - chart.config.padding.right}
                      y1={tick.y}
                      y2={tick.y}
                    />
                  ) : null}
                </g>
              ))}
              <line
                className="history-chart-axis-line"
                x1={chart.config.padding.left}
                x2={chart.config.padding.left}
                y1={chart.config.padding.top}
                y2={chart.config.height - chart.config.padding.bottom}
              />
              <line
                className="history-chart-axis-line"
                x1={chart.config.padding.left}
                x2={chart.config.width - chart.config.padding.right}
                y1={chart.config.height - chart.config.padding.bottom}
                y2={chart.config.height - chart.config.padding.bottom}
              />
              <path className="history-chart-area" d={chart.areaPath} />
              <path className="history-chart-line" d={chart.linePath} />
              {chart.points.map((point) => (
                <circle
                  className={`history-chart-point ${
                    point.observationType === "current_price_confirmation" ? "is-confirmation" : ""
                  } ${activePointKey === point.key ? "is-active" : ""}`}
                  key={point.key}
                  cx={point.x}
                  cy={point.y}
                  r="2.2"
                />
              ))}
            </svg>

            {chart.markers.map((marker) => (
              <FixedChartMarker chartConfig={chart.config} key={marker.key} marker={marker} />
            ))}

            {chart.points.map((point) => (
              <button
                aria-label={getPointAriaLabel(point)}
                className="history-chart-point-button"
                key={point.key}
                style={{
                  left: `${(point.x / chart.config.width) * 100}%`,
                  top: `${(point.y / chart.config.height) * 100}%`,
                }}
                type="button"
                onBlur={() => onActivePointKeyChange(null)}
                onClick={() => onActivePointKeyChange(point.key)}
                onFocus={() => onActivePointKeyChange(point.key)}
                onMouseEnter={() => onActivePointKeyChange(point.key)}
                onMouseLeave={() => onActivePointKeyChange(null)}
              />
            ))}

            {activePoint ? <HistoryTooltip chartConfig={chart.config} point={activePoint} /> : null}
          </div>
          <div className="history-chart-axis" aria-hidden="true">
            <span>{formatTaipeiMonthDay(summary.startedAt)}</span>
            <span>{formatTaipeiMonthDay(summary.endedAt)}</span>
          </div>
        </>
      ) : (
        <div className="history-chart-stage history-chart-stage-empty">
          <p className="history-empty history-chart-empty-text">{getInsufficientDataMessage()}</p>
        </div>
      )}
    </div>
  );
}

// 建立圖表 aria-label，讓螢幕閱讀器可辨識目前顯示的價格歷史範圍。
function formatChartAriaLabel(
  range: PriceHistoryRangeKey,
  rangeDays: PriceHistoryRangeDays | null,
) {
  return range === "all" ? "全部時間價格走勢圖" : `近 ${rangeDays} 天價格走勢圖`;
}
