"use client";

export type PriceHistoryLoadState = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface ProductPriceHistoryBody {
  productId: string;
  rangeDays: 7 | 30 | 90;
  points: PriceHistoryPoint[];
  summary: {
    pointCount: number;
    startedAt: string | null;
    endedAt: string | null;
    lowest: PriceHistorySummaryPoint | null;
    highest: PriceHistorySummaryPoint | null;
    first: PriceHistorySummaryPoint | null;
    latest: PriceHistorySummaryPoint | null;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
}

interface PriceHistoryPoint {
  amount: number;
  currency: "TWD";
  observedAt: string;
  source: "price_snapshot" | "current_price_confirmation";
}

interface PriceHistorySummaryPoint {
  amount: number;
  observedAt: string;
}

export default function PriceHistoryPanel({
  history,
  state,
}: {
  history: ProductPriceHistoryBody | null;
  state: PriceHistoryLoadState;
}) {
  if (state === "idle" || state === "loading") {
    return (
      <section className="history-panel" aria-label="價格歷史載入中">
        <div className="history-header">
          <div>
            <h2>價格走勢</h2>
            <p>近 90 天</p>
          </div>
        </div>
        <div className="history-loading">
          <span className="skeleton-box history-chart-skeleton" />
        </div>
      </section>
    );
  }

  if (state === "error" || state === "unavailable" || !history) {
    return (
      <section className="history-panel" aria-labelledby="price-history-title">
        <div className="history-header">
          <div>
            <h2 id="price-history-title">價格走勢</h2>
            <p>近 90 天</p>
          </div>
        </div>
        <p className="history-empty">價格歷史暫時無法載入。</p>
      </section>
    );
  }

  if (history.points.length < 2) {
    return (
      <section className="history-panel" aria-labelledby="price-history-title">
        <div className="history-header">
          <div>
            <h2 id="price-history-title">價格走勢</h2>
            <p>近 {history.rangeDays} 天</p>
          </div>
        </div>
        <p className="history-empty">目前只有單一價格紀錄，尚無可比較區間。</p>
      </section>
    );
  }

  const lowest = history.summary.lowest;
  const highest = history.summary.highest;
  const latest = history.summary.latest;

  if (!lowest || !highest || !latest) {
    return null;
  }

  const chartPoints = createChartPoints(history.points);
  const deltaClass = getDeltaClass(history.summary.deltaAmount);

  return (
    <section className="history-panel" aria-labelledby="price-history-title">
      <div className="history-header">
        <div>
          <h2 id="price-history-title">價格走勢</h2>
          <p>
            近 {history.rangeDays} 天，{history.summary.pointCount} 筆價格紀錄
          </p>
        </div>
        <div className={`history-delta ${deltaClass}`}>
          <span>區間變化</span>
          <strong>{formatSignedPrice(history.summary.deltaAmount)}</strong>
          <small>{formatSignedPercent(history.summary.deltaPercent)}</small>
        </div>
      </div>

      <div className="history-metrics">
        <HistoryMetric label="目前" point={latest} />
        <HistoryMetric label="最低" point={lowest} />
        <HistoryMetric label="最高" point={highest} />
      </div>

      <div className="history-chart-wrap">
        <svg
          className="history-chart"
          role="img"
          aria-label={`近 ${history.rangeDays} 天價格走勢圖`}
          viewBox="0 0 640 180"
        >
          <line className="history-chart-grid" x1="20" x2="620" y1="28" y2="28" />
          <line className="history-chart-grid" x1="20" x2="620" y1="152" y2="152" />
          <polyline className="history-chart-line" points={chartPoints.line} />
          {chartPoints.points.map((point) => (
            <circle
              className="history-chart-point"
              key={`${point.observedAt}-${point.amount}-${point.source}`}
              cx={point.x}
              cy={point.y}
              r="4"
            />
          ))}
        </svg>
        <div className="history-chart-axis" aria-hidden="true">
          <span>{formatCompactDate(history.summary.startedAt)}</span>
          <span>{formatCompactDate(history.summary.endedAt)}</span>
        </div>
      </div>
    </section>
  );
}

function HistoryMetric({ label, point }: { label: string; point: PriceHistorySummaryPoint }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{formatPrice(point.amount)}</strong>
      <small>{formatCompactDate(point.observedAt)}</small>
    </div>
  );
}

function formatPrice(amount: number) {
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

function formatSignedPrice(amount: number | null) {
  if (amount === null) {
    return "資料不足";
  }

  if (amount === 0) {
    return "NT$ 0";
  }

  return `${amount > 0 ? "+" : "-"}${formatPrice(Math.abs(amount))}`;
}

function formatSignedPercent(percent: number | null) {
  if (percent === null) {
    return "";
  }

  if (percent === 0) {
    return "0%";
  }

  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

function formatCompactDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getDeltaClass(amount: number | null) {
  if (amount === null || amount === 0) {
    return "is-flat";
  }

  return amount > 0 ? "is-up" : "is-down";
}

function createChartPoints(points: PriceHistoryPoint[]) {
  const width = 640;
  const height = 180;
  const paddingX = 20;
  const paddingY = 28;
  const minPrice = Math.min(...points.map((point) => point.amount));
  const maxPrice = Math.max(...points.map((point) => point.amount));
  const priceRange = maxPrice - minPrice;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const scaledPoints = points.map((point, index) => {
    const x = paddingX + (index / Math.max(points.length - 1, 1)) * innerWidth;
    const y =
      priceRange === 0
        ? height / 2
        : paddingY + ((maxPrice - point.amount) / priceRange) * innerHeight;

    return {
      ...point,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  });

  return {
    line: scaledPoints.map((point) => `${point.x},${point.y}`).join(" "),
    points: scaledPoints,
  };
}
