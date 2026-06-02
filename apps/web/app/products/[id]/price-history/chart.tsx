"use client";

import { useEffect, useState } from "react";
import {
  formatCompactDate,
  formatPointSource,
  formatPrice,
  formatSignedPercent,
  formatTooltipDate,
  getInsufficientDataMessage,
  getPointAriaLabel,
} from "./format";
import type {
  ChartConfig,
  ChartMarker,
  ChartModel,
  ChartPoint,
  HistoryViewSummary,
  PriceHistoryRangeDays,
} from "./types";

const DESKTOP_CHART_CONFIG = {
  width: 640,
  height: 196,
  padding: {
    top: 12,
    right: 24,
    bottom: 30,
    left: 50,
  },
} as const satisfies ChartConfig;

const MOBILE_CHART_CONFIG = {
  width: 300,
  height: 260,
  padding: {
    top: 20,
    right: 22,
    bottom: 36,
    left: 50,
  },
} as const satisfies ChartConfig;

export function useChartConfig() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateChartConfig = () => setIsMobile(mediaQuery.matches);

    updateChartConfig();
    mediaQuery.addEventListener("change", updateChartConfig);

    return () => mediaQuery.removeEventListener("change", updateChartConfig);
  }, []);

  return isMobile ? MOBILE_CHART_CONFIG : DESKTOP_CHART_CONFIG;
}

export function PriceHistoryChart({
  activePointKey,
  chart,
  rangeDays,
  summary,
  onActivePointKeyChange,
}: {
  activePointKey: string | null;
  chart: ChartModel | null;
  rangeDays: PriceHistoryRangeDays;
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
              aria-label={`近 ${rangeDays} 天價格走勢圖`}
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
                className="history-chart-axis-line history-chart-x-axis-line"
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
                    point.source === "current_price_confirmation" ? "is-confirmation" : ""
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
            <span>{formatCompactDate(summary.startedAt)}</span>
            <span>{formatCompactDate(summary.endedAt)}</span>
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

function FixedChartMarker({
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

function HistoryTooltip({
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
